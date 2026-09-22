import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import {
  dataOrThrow,
  initializeLiveClient,
  loadLiveConfig,
  signIn,
} from "./lib/cloudbase-pg-live.mjs";

const label = `ideas-comparisons-${Date.now()}-${randomUUID().slice(0, 8)}`;
const userA = "19900000101";
const userB = "19900000102";

function rows(result, name) {
  const data = dataOrThrow(result, name);
  return Array.isArray(data) ? data : data == null ? [] : [data];
}

async function createTrip(db, title) {
  const result = await db.rpc("create_trip_v3", {
    trip_title: title,
    trip_start_date: "2026-10-01",
    trip_end_date: "2026-10-03",
    trip_timezone: "UTC",
    trip_currency: "USD",
    trip_day_count: 3,
    trip_locale: "en",
    target_operation_id: randomUUID(),
  });
  if (result.error && !/JSON/i.test(String(result.error.message)))
    dataOrThrow(result, "create Trip");
  const trips = rows(await db.from("trips").select("id").eq("title", title), "Trip lookup");
  assert.equal(trips.length, 1);
  return trips[0].id;
}

async function capture(db, tripId, kind, title, fields = {}) {
  const id = randomUUID();
  dataOrThrow(
    await db.rpc("capture_idea_v1", {
      target_trip_id: tripId,
      target_operation_id: id,
      requested_kind: kind,
      requested_title: title,
      requested_source_url: null,
      requested_share_text: title,
      requested_fields: fields,
    }),
    `capture ${kind}`,
  );
  return id;
}

async function createComparison(db, tripId, title, choices) {
  const result = await db.rpc("create_idea_comparison_v2", {
    target_trip_id: tripId,
    requested_title: title,
    requested_choices: choices,
  });
  const created = dataOrThrow(result, "create comparison");
  assert.ok(created?.id);
  const comparisons = rows(
    await db.from("idea_comparisons").select("id").eq("trip_id", tripId).eq("title", title),
    "comparison lookup",
  );
  assert.equal(comparisons.length, 1);
  return comparisons[0].id;
}

async function comparison(db, tripId, id) {
  const data = dataOrThrow(
    await db.rpc("list_idea_comparisons_v1", {
      target_trip_id: tripId,
    }),
    "list comparisons",
  );
  assert.ok(Array.isArray(data));
  return data.find((entry) => entry.id === id);
}

async function apply(db, tripId, variantId, comparisonId, choiceId) {
  return dataOrThrow(
    await db.rpc("apply_idea_choice_v1", {
      target_trip_id: tripId,
      target_variant_id: variantId,
      target_comparison_id: comparisonId,
      target_choice_id: choiceId,
      requested_day_id: null,
      target_operation_id: randomUUID(),
    }),
    "apply choice",
  );
}

async function cleanup(db, tripIds) {
  const failures = [];
  for (const id of tripIds) {
    try {
      const trip = rows(
        await db.from("trips").select("version,content_version").eq("id", id),
        "cleanup lookup",
      )[0];
      if (!trip) continue;
      dataOrThrow(
        await db.rpc("delete_trip_v3", {
          target_trip_id: id,
          expected_version: trip.version,
          expected_content_version: trip.content_version,
          target_operation_id: randomUUID(),
        }),
        "cleanup Trip",
      );
    } catch (error) {
      failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(`Fixture cleanup failed: ${failures.join("; ")}`);
}

async function run() {
  const config = loadLiveConfig();
  const first = initializeLiveClient(config);
  const tripIds = [];
  let failure;
  try {
    const firstUserId = await signIn(first.auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    const tripId = await createTrip(first.db, `${label}-main`);
    tripIds.push(tripId);
    const otherTripId = await createTrip(first.db, `${label}-other`);
    tripIds.push(otherTripId);
    const variant = rows(
      await first.db.from("route_variants").select("id").eq("trip_id", tripId),
      "variant lookup",
    )[0];
    const days = rows(
      await first.db.from("trip_days").select("id,day_number").eq("variant_id", variant.id),
      "day lookup",
    );
    assert.equal(days.length, 3);
    const flightA = await capture(first.db, tripId, "flight", "Beijing to Shanghai", {
      originText: "Beijing",
      destinationText: "Shanghai",
      startDate: "2026-10-01",
    });
    const flightB1 = await capture(first.db, tripId, "flight", "Beijing to Hangzhou", {
      originText: "Beijing",
      destinationText: "Hangzhou",
      startDate: "2026-10-02",
    });
    const flightB2 = await capture(first.db, tripId, "flight", "Hangzhou to Shanghai", {
      originText: "Hangzhou",
      destinationText: "Shanghai",
      startDate: "2026-10-03",
    });
    const stay = await capture(first.db, tripId, "stay", "Hangzhou stay", {
      startDate: "2026-10-01",
      endDate: "2026-10-03",
    });
    const car = await capture(first.db, tripId, "car", "Rental car");
    const activity = await capture(first.db, tripId, "activity", "Ride by West Lake");
    const foreignIdea = await capture(first.db, otherTripId, "flight", "Other Trip flight");
    const saved = rows(
      await first.db.from("research_items").select("id,category").eq("trip_id", tripId),
      "Ideas lookup",
    );
    assert.equal(saved.length, 6);
    assert.deepEqual(
      new Set(saved.map((item) => item.category)),
      new Set(["flight", "stay", "rental", "activity"]),
    );

    const rejected = await first.db.rpc("create_idea_comparison_v2", {
      target_trip_id: tripId,
      requested_title: `${label}-foreign`,
      requested_choices: [[flightA], [foreignIdea]],
    });
    assert.ok(rejected.error, "cross-Trip Idea was accepted");
    const comparisonId = await createComparison(first.db, tripId, `${label}-flights`, [
      [flightA],
      [flightB1, flightB2],
      [flightA, stay, car, activity],
    ]);
    const secondId = await createComparison(first.db, tripId, `${label}-reused`, [
      [flightA],
      [stay],
    ]);
    assert.ok(secondId);
    const group = await comparison(first.db, tripId, comparisonId);
    assert.equal(group.choices.length, 3);
    assert.deepEqual(
      group.choices.map((choice) => choice.itemIds.length),
      [1, 2, 4],
    );

    await first.auth.signOut();
    const second = initializeLiveClient(config);
    const secondUserId = await signIn(second.auth, userB, config.CLOUDBASE_TEST_USER_B_PASSWORD);
    assert.notEqual(firstUserId, secondUserId, "test users share an identity");
    assert.equal(
      rows(await second.db.from("trips").select("id").eq("id", tripId), "nonmember Trip lookup")
        .length,
      0,
      "nonmember can read the test Trip",
    );
    const forbiddenRead = await second.db.rpc("list_idea_comparisons_v1", {
      target_trip_id: tripId,
    });
    assert.ok(
      forbiddenRead.error || !String(JSON.stringify(forbiddenRead.data)).includes(comparisonId),
      `nonmember read exposed comparison data (type=${typeof forbiddenRead.data}, array=${Array.isArray(forbiddenRead.data)})`,
    );
    const forbiddenWrite = await second.db.rpc("create_idea_comparison_v2", {
      target_trip_id: tripId,
      requested_title: `${label}-denied`,
      requested_choices: [[flightA], [flightB1]],
    });
    assert.ok(forbiddenWrite.error);
    await second.auth.signOut();
    await signIn(first.auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);

    const activityResult = dataOrThrow(
      await first.db.rpc("apply_single_idea_v1", {
        target_trip_id: tripId,
        target_variant_id: variant.id,
        target_research_item_id: activity,
        requested_day_id: days[0].id,
        requested_before_item_id: null,
        target_operation_id: randomUUID(),
      }),
      "direct Activity apply",
    );
    assert.equal(activityResult.status, "applied");
    const firstUse = await apply(first.db, tripId, variant.id, comparisonId, group.choices[0].id);
    assert.equal(firstUse.status, "applied");
    const repeated = await apply(first.db, tripId, variant.id, comparisonId, group.choices[0].id);
    assert.equal(repeated.status, "already_applied");
    const switched = await apply(first.db, tripId, variant.id, comparisonId, group.choices[1].id);
    assert.equal(switched.switched, true);
    const plan = rows(
      await first.db
        .from("itinerary_items")
        .select("type,title,details")
        .eq("variant_id", variant.id),
      "Plan lookup",
    );
    assert.equal(plan.filter((item) => item.details?.ideaComparisonId === comparisonId).length, 2);
    assert.equal(plan.filter((item) => item.details?.ideaResearchItemId === activity).length, 1);
    assert.equal(plan.filter((item) => item.details?.ideaResearchItemId === flightA).length, 0);
    assert.ok(
      (await comparison(first.db, tripId, comparisonId)).choices[0].itemIds.includes(flightA),
    );
    const generated = rows(
      await first.db.from("itinerary_items").select("*").eq("variant_id", variant.id),
      "generated Plan lookup",
    ).find((item) => item.title === "Beijing to Hangzhou");
    assert.ok(generated);
    const dayVersion = rows(
      await first.db.from("trip_days").select("items_version").eq("id", generated.day_id),
      "Plan day version",
    )[0];
    const order = rows(
      await first.db.from("itinerary_items").select("id,sort_order").eq("day_id", generated.day_id),
      "Plan day order",
    )
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) => item.id);
    dataOrThrow(
      await first.db.rpc("save_itinerary_item_v3", {
        target_trip_id: tripId,
        target_variant_id: variant.id,
        target_day_id: generated.day_id,
        target_item_id: generated.id,
        requested_item: {
          type: generated.type,
          title: "Edited by traveler",
          notes: generated.notes,
          details: generated.details,
          bookingUrl: generated.booking_url,
          startTime: generated.start_time,
          endTime: generated.end_time,
          scheduleKind: generated.schedule_kind,
          priceAmount: generated.price_amount,
          priceCurrency: generated.price_currency,
          placeId: generated.place_id,
        },
        requested_links: [],
        requested_draft_session_id: null,
        ordered_item_ids: order,
        expected_version: generated.version,
        expected_items_version: dayVersion.items_version,
        target_operation_id: randomUUID(),
      }),
      "edit generated Plan item",
    );
    const unsafeSwitch = await first.db.rpc("apply_idea_choice_v1", {
      target_trip_id: tripId,
      target_variant_id: variant.id,
      target_comparison_id: comparisonId,
      target_choice_id: group.choices[0].id,
      requested_day_id: null,
      target_operation_id: randomUUID(),
    });
    assert.ok(unsafeSwitch.error, "switch deleted an edited Plan item");
    assert.equal(
      rows(
        await first.db.from("itinerary_items").select("id").eq("id", generated.id),
        "edited Plan item check",
      ).length,
      1,
    );
    const deleted = dataOrThrow(
      await first.db.rpc("delete_idea_comparison_v1", {
        target_trip_id: tripId,
        target_comparison_id: comparisonId,
        target_operation_id: randomUUID(),
      }),
      "delete comparison",
    );
    assert.equal(deleted.status, "deleted");
    assert.equal(await comparison(first.db, tripId, comparisonId), undefined);
    assert.equal(
      rows(
        await first.db.from("research_items").select("id").eq("trip_id", tripId),
        "Ideas after comparison delete",
      ).length,
      6,
    );
    assert.equal(
      rows(
        await first.db.from("itinerary_items").select("id").eq("variant_id", variant.id),
        "Plan after comparison delete",
      ).length,
      plan.length,
    );
    console.log(
      "Ideas comparison live data and permission checks passed; fixtures retained until cleanup.",
    );
  } catch (error) {
    failure = error;
  }
  try {
    await signIn(first.auth, userA, config.CLOUDBASE_TEST_USER_A_PASSWORD);
    await cleanup(first.db, tripIds);
  } catch (error) {
    failure = failure
      ? new AggregateError([failure, error], "Live checks and cleanup failed")
      : error;
  }
  await first.auth.signOut();
  if (failure) throw failure;
  console.log("Ideas comparison fixture cleanup passed.");
}

run().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  },
);
