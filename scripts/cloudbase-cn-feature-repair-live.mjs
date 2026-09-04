import { randomUUID } from "node:crypto";

import {
  dataOrThrow,
  initializeLiveClient,
  loadLiveConfig,
  scalar,
  signIn,
} from "./lib/cloudbase-pg-live.mjs";

const user = "trip-planner-cn-test-a";

function rows(result, label) {
  const data = dataOrThrow(result, label);
  if (!Array.isArray(data)) throw new Error(`${label} did not return rows`);
  return data;
}

function committedJsonParserFailure(result) {
  const message = String(result?.error?.message ?? result?.error ?? "");
  return /(?:SyntaxError:.*JSON|not valid JSON|JSON at position|unexpected end|unexpected number)/i.test(
    message,
  );
}

async function committedScalar(result, lookup, label) {
  if (!result?.error) {
    const value = scalar(result.data);
    if (typeof value === "string" && value) return value;
    throw new Error(`${label} returned an invalid scalar`);
  }
  if (!committedJsonParserFailure(result)) dataOrThrow(result, label);
  const recovered = rows(await lookup(), `${label} recovery`);
  if (recovered.length !== 1 || typeof recovered[0]?.id !== "string") {
    throw new Error(`${label} did not recover exactly one committed row`);
  }
  return recovered[0].id;
}

async function committedOrder(result, lookup, expectedIds, label) {
  if (result?.error && !committedJsonParserFailure(result)) dataOrThrow(result, label);
  const recovered = rows(await lookup(), `${label} recovery`).map(({ id }) => id);
  if (JSON.stringify(recovered) !== JSON.stringify(expectedIds)) {
    throw new Error(`${label} did not persist the expected order`);
  }
}

async function createFixture(db, title) {
  return committedScalar(
    await db.rpc("create_trip", {
      trip_currency: "CNY",
      trip_day_count: 2,
      trip_end_date: null,
      trip_start_date: null,
      trip_timezone: "Asia/Shanghai",
      trip_title: title,
    }),
    () => db.from("trips").select("id").eq("title", title),
    "create trip",
  );
}

async function run() {
  const config = loadLiveConfig();
  const { auth, db } = initializeLiveClient(config);
  const title = `cn-feature-repair-${randomUUID()}`;
  let tripId;
  try {
    await signIn(auth, user, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    tripId = await createFixture(db, title);
    const variants = rows(
      await db.from("route_variants").select("id").eq("trip_id", tripId).eq("is_primary", true),
      "primary variant",
    );
    if (variants.length !== 1) throw new Error("Primary variant fixture mismatch");
    const primaryVariantId = variants[0].id;

    const insertedDayId = await committedScalar(
      await db.rpc("insert_variant_day", {
        before_day_number: 2,
        target_trip_id: tripId,
        target_variant_id: primaryVariantId,
      }),
      () =>
        db.from("trip_days").select("id").eq("variant_id", primaryVariantId).eq("day_number", 2),
      "insert day",
    );
    const days = rows(
      await db.from("trip_days").select("id,day_number").eq("variant_id", primaryVariantId),
      "inserted days",
    );
    if (days.length !== 3 || !days.some(({ id }) => id === insertedDayId)) {
      throw new Error("Inserted day was not retained");
    }

    const hotel = rows(
      await db
        .from("itinerary_items")
        .insert({
          day_id: insertedDayId,
          details: {},
          sort_order: 0,
          title: "CN live hotel",
          trip_id: tripId,
          type: "hotel",
          variant_id: primaryVariantId,
        })
        .select("id"),
      "hotel create",
    );
    const transport = rows(
      await db
        .from("itinerary_items")
        .insert({
          day_id: insertedDayId,
          details: { mode: "flight" },
          sort_order: 1,
          title: "CN live flight",
          trip_id: tripId,
          type: "transport",
          variant_id: primaryVariantId,
        })
        .select("id"),
      "transport create",
    );
    const orderedIds = [transport[0].id, hotel[0].id];
    await committedOrder(
      await db.rpc("reorder_itinerary_items", {
        ordered_item_ids: orderedIds,
        target_day_id: insertedDayId,
      }),
      () =>
        db
          .from("itinerary_items")
          .select("id")
          .eq("day_id", insertedDayId)
          .order("sort_order")
          .order("id"),
      orderedIds,
      "hotel and transport reorder",
    );

    await committedScalar(
      await db.rpc("create_route_variant", {
        source_variant_id: primaryVariantId,
        target_trip_id: tripId,
        variant_color: "#2563eb",
        variant_name: "CN live blank",
      }),
      () =>
        db
          .from("route_variants")
          .select("id")
          .eq("trip_id", tripId)
          .eq("name", "CN live blank")
          .eq("color", "#2563eb"),
      "blank variant create",
    );
    const duplicateVariantId = await committedScalar(
      await db.rpc("duplicate_route_variant", {
        source_variant_id: primaryVariantId,
        target_trip_id: tripId,
        variant_color: "#9333ea",
        variant_name: "CN live copy",
      }),
      () =>
        db
          .from("route_variants")
          .select("id")
          .eq("trip_id", tripId)
          .eq("name", "CN live copy")
          .eq("color", "#9333ea"),
      "variant duplicate",
    );
    const copiedItems = rows(
      await db.from("itinerary_items").select("id").eq("variant_id", duplicateVariantId),
      "duplicated items",
    );
    if (copiedItems.length !== 2)
      throw new Error("Variant copy did not retain both itinerary items");

    const idea = rows(
      await db
        .from("research_items")
        .insert({ category: "stay", title: "CN live saved idea", trip_id: tripId })
        .select("id,title"),
      "save idea",
    );
    if (idea.length !== 1 || idea[0].title !== "CN live saved idea") {
      throw new Error("Saved idea did not round trip");
    }
  } finally {
    if (tripId) {
      dataOrThrow(await db.from("trips").delete().eq("id", tripId).select("id"), "fixture cleanup");
      const remaining = rows(
        await db.from("trips").select("id").eq("id", tripId),
        "fixture cleanup check",
      );
      if (remaining.length) throw new Error("CN feature repair fixture was not deleted");
    }
    await auth.signOut();
  }
  console.log(
    "CN live feature repair passed: day insert, hotel/transport order, blank/copy variants, and Save idea; fixture deleted.",
  );
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : "CN feature repair live test failed");
    process.exit(1);
  },
);
