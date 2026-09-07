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
    if (value && typeof value === "object") {
      const id = ["id", "tripId", "dayId", "itemId", "variantId", "researchItemId"]
        .map((key) => value[key])
        .find((candidate) => typeof candidate === "string");
      if (id) return id;
    }
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
  const operationId = randomUUID();
  return committedScalar(
    await db.rpc("create_trip_v3", {
      target_operation_id: operationId,
      trip_currency: "CNY",
      trip_day_count: 2,
      trip_end_date: null,
      trip_locale: "zh-CN",
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
      await db
        .from("route_variants")
        .select("id,days_version,items_version")
        .eq("trip_id", tripId)
        .eq("is_primary", true),
      "primary variant",
    );
    if (variants.length !== 1) throw new Error("Primary variant fixture mismatch");
    const primaryVariantId = variants[0].id;

    const insertedDayId = await committedScalar(
      await db.rpc("insert_variant_day_v2", {
        before_day_number: 2,
        expected_days_version: variants[0].days_version,
        target_operation_id: randomUUID(),
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

    const insertedDay = rows(
      await db.from("trip_days").select("id,items_version").eq("id", insertedDayId),
      "inserted day version",
    )[0];
    const hotelId = randomUUID();
    const hotel = [
      {
        id: await committedScalar(
          await db.rpc("save_itinerary_item_v3", {
            expected_items_version: insertedDay.items_version,
            expected_version: null,
            ordered_item_ids: [hotelId],
            requested_draft_session_id: null,
            requested_item: { details: {}, title: "CN live hotel", type: "hotel" },
            requested_links: [],
            target_day_id: insertedDayId,
            target_item_id: hotelId,
            target_operation_id: hotelId,
            target_trip_id: tripId,
            target_variant_id: primaryVariantId,
          }),
          () => db.from("itinerary_items").select("id").eq("id", hotelId),
          "hotel create",
        ),
      },
    ];
    const nextDay = rows(
      await db.from("trip_days").select("items_version").eq("id", insertedDayId),
      "hotel version",
    )[0];
    const transportId = randomUUID();
    const transport = [
      {
        id: await committedScalar(
          await db.rpc("save_itinerary_item_v3", {
            expected_items_version: nextDay.items_version,
            expected_version: null,
            ordered_item_ids: [hotel[0].id, transportId],
            requested_draft_session_id: null,
            requested_item: {
              details: { mode: "flight" },
              title: "CN live flight",
              type: "transport",
            },
            requested_links: [],
            target_day_id: insertedDayId,
            target_item_id: transportId,
            target_operation_id: transportId,
            target_trip_id: tripId,
            target_variant_id: primaryVariantId,
          }),
          () => db.from("itinerary_items").select("id").eq("id", transportId),
          "transport create",
        ),
      },
    ];
    const orderedIds = [transport[0].id, hotel[0].id];
    await committedOrder(
      await db.rpc("reorder_itinerary_items_v2", {
        expected_items_version: nextDay.items_version + 1,
        ordered_item_ids: orderedIds,
        target_day_id: insertedDayId,
        target_operation_id: randomUUID(),
        target_trip_id: tripId,
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
    const activityDay = rows(
      await db.from("trip_days").select("items_version").eq("id", insertedDayId),
      "activity day version",
    )[0];
    const activityId = randomUUID();
    await committedScalar(
      await db.rpc("save_itinerary_item_v3", {
        expected_items_version: activityDay.items_version,
        expected_version: null,
        ordered_item_ids: [...orderedIds, activityId],
        requested_draft_session_id: null,
        requested_item: {
          details: {},
          placeSnapshot: {
            coordinateSystem: "wgs84",
            displayName: "上海人民广场",
            formattedAddress: "上海市黄浦区人民广场",
            latitude: 31.2304,
            longitude: 121.4737,
            provider: "amap",
            providerPlaceId: `cn-live-${activityId}`,
          },
          scheduleKind: "none",
          title: "上海人民广场",
          type: "activity",
        },
        requested_links: [],
        target_day_id: insertedDayId,
        target_item_id: activityId,
        target_operation_id: activityId,
        target_trip_id: tripId,
        target_variant_id: primaryVariantId,
      }),
      () => db.from("itinerary_items").select("id").eq("id", activityId),
      "activity create",
    );
    rows(
      await db
        .from("itinerary_items")
        .select(
          "*, place:places(id, source, provider_place_id, google_place_id, coordinate_system, display_name, formatted_address, latitude, longitude, locality_name, locality_kind, country_code, administrative_area_name, locality_source), links:itinerary_item_links(id, item_id, label, url, sort_order), attachments:asset_links(id, public_ref, display_filename, sort_order, include_in_share, draft_session_id, created_at, version, asset:assets!asset_links_asset_owner_fkey(media_kind, mime_type, byte_size, status, width, height, duration_seconds))",
        )
        .eq("id", activityId),
      "activity full reload",
    );
    const titledTrip = rows(
      await db.from("trips").select("title,version").eq("id", tripId),
      "trip auto-title version",
    )[0];
    dataOrThrow(
      await db.rpc("rename_trip_if_title_v2", {
        current_title: titledTrip.title,
        expected_version: titledTrip.version,
        next_title: "上海 Trip",
        target_operation_id: randomUUID(),
        target_trip_id: tripId,
      }),
      "trip auto-title",
    );

    await committedScalar(
      await db.rpc("create_route_variant_v2", {
        duplicate_content: false,
        source_variant_id: primaryVariantId,
        target_trip_id: tripId,
        target_operation_id: randomUUID(),
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
      await db.rpc("create_route_variant_v2", {
        duplicate_content: true,
        source_variant_id: primaryVariantId,
        target_trip_id: tripId,
        target_operation_id: randomUUID(),
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
    if (copiedItems.length !== 3)
      throw new Error("Variant copy did not retain all itinerary items");

    const ideaId = randomUUID();
    await committedScalar(
      await db.rpc("save_research_item_v2", {
        expected_version: null,
        requested_item: {
          category: "stay",
          operationId: ideaId,
          title: "CN live saved idea",
          tripId,
        },
        target_operation_id: ideaId,
        target_research_item_id: ideaId,
        target_trip_id: tripId,
      }),
      () => db.from("research_items").select("id").eq("id", ideaId),
      "save idea",
    );
    const idea = rows(
      await db.from("research_items").select("id,title").eq("id", ideaId),
      "saved idea",
    );
    if (idea.length !== 1 || idea[0].title !== "CN live saved idea") {
      throw new Error("Saved idea did not round trip");
    }
  } finally {
    if (tripId) {
      const trip = rows(
        await db.from("trips").select("version").eq("id", tripId),
        "trip version",
      )[0];
      dataOrThrow(
        await db.rpc("delete_trip_v2", {
          expected_version: trip.version,
          target_operation_id: randomUUID(),
          target_trip_id: tripId,
        }),
        "fixture cleanup",
      );
      const remaining = rows(
        await db.from("trips").select("id").eq("id", tripId),
        "fixture cleanup check",
      );
      if (remaining.length) throw new Error("CN feature repair fixture was not deleted");
    }
    await auth.signOut();
  }
  console.log(
    "CN live feature repair passed: day insert, atomic placed activity, hotel/transport order, blank/copy variants, and Save idea; fixture deleted.",
  );
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : "CN feature repair live test failed");
    process.exit(1);
  },
);
