import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCopyRows, normalizedTimes } from "./mutation-helpers.ts";
import {
  carRentalDetailsSchema,
  copyItineraryItemsSchema,
  createItineraryItemSchema,
  deleteItineraryItemSchema,
  reorderItineraryItemsSchema,
  updateItineraryItemSchema,
} from "./schema.ts";
import type { ItineraryItem } from "./types.ts";

const ids = {
  day: "00000000-0000-4000-8000-000000000003",
  item: "00000000-0000-4000-8000-000000000004",
  targetDay: "00000000-0000-4000-8000-000000000005",
  trip: "00000000-0000-4000-8000-000000000001",
  variant: "00000000-0000-4000-8000-000000000002",
};

const base = { dayId: ids.day, details: {}, title: "Museum", tripId: ids.trip, type: "activity" as const, variantId: ids.variant };

test("create accepts missing, start-only, and end-only time", () => {
  assert.equal(createItineraryItemSchema.safeParse(base).success, true);
  assert.equal(createItineraryItemSchema.safeParse({ ...base, startTime: "09:30" }).success, true);
  assert.equal(createItineraryItemSchema.safeParse({ ...base, endTime: "11:00" }).success, true);
  assert.deepEqual(normalizedTimes("", undefined), { start_time: null, end_time: null });
});

test("edit and delete inputs validate", () => {
  assert.equal(updateItineraryItemSchema.safeParse({ id: ids.item, tripId: ids.trip, title: "Edited", type: "activity" }).success, true);
  assert.equal(deleteItineraryItemSchema.safeParse({ id: ids.item, tripId: ids.trip }).success, true);
});

test("car rental details require action, location, and confirmed while time/provider remain optional", () => {
  assert.equal(carRentalDetailsSchema.safeParse({ action: "pickup", confirmed: false, location: "Berlin Hbf" }).success, true);
  assert.equal(carRentalDetailsSchema.safeParse({ action: "return", confirmed: true, location: "BER", provider: "Sixt", time: "16:30" }).success, true);
  assert.equal(carRentalDetailsSchema.safeParse({ action: "pickup", confirmed: false }).success, false);
  assert.equal(carRentalDetailsSchema.safeParse({ action: "dropoff", confirmed: false, location: "BER" }).success, false);
});

test("reorder payload persists explicit unique sort orders", () => {
  const parsed = reorderItineraryItemsSchema.parse({ dayId: ids.day, items: [{ id: ids.item, sortOrder: 1 }], tripId: ids.trip });
  assert.deepEqual(parsed.items, [{ id: ids.item, sortOrder: 1 }]);
  assert.equal(reorderItineraryItemsSchema.safeParse({ dayId: ids.day, items: [{ id: ids.item, sortOrder: 0 }, { id: ids.item, sortOrder: 1 }], tripId: ids.trip }).success, false);
});

test("copies get new IDs, destination ordering, and independent values", () => {
  const source = {
    booking_url: "https://example.com", created_at: "2026-01-01", day_id: ids.day, details: { confirmed: true },
    end_time: null, id: ids.item, notes: "Original", place_id: null, sort_order: 2, start_time: null,
    title: "Museum", trip_id: ids.trip, type: "activity", updated_at: "2026-01-01", variant_id: ids.variant,
  } satisfies ItineraryItem;
  const [copy] = buildCopyRows([source], ids.targetDay, 7, true, () => "00000000-0000-4000-8000-000000000006");
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.day_id, ids.targetDay);
  assert.equal(copy.sort_order, 7);
  copy.title = "Independent edit";
  assert.equal(source.title, "Museum");
  assert.equal(copyItineraryItemsSchema.safeParse({ sourceItemIds: [ids.item], targetDayId: ids.targetDay, tripId: ids.trip }).success, true);
});

test("RLS remains the write authority and server actions do not use a service role", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260729160000_initial_schema.sql", import.meta.url), "utf8");
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  assert.match(migration, /itinerary_items_(insert|update|delete)_owners/);
  assert.match(migration, /public\.is_trip_owner\(trip_id\)/);
  assert.doesNotMatch(actions, /service[_-]?role/i);
});
