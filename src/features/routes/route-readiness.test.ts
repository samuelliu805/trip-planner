import assert from "node:assert/strict";
import { test } from "node:test";
import type { ItineraryItem } from "../itinerary/types.ts";
import { defaultDayRouteDraft } from "./day-route-default-draft.ts";
import { synchronizeSavedDayRouteDraft } from "./day-route-synchronization.ts";
import { canCalculateRouteStops } from "./route-readiness.ts";

const item = (
  id: string,
  type: ItineraryItem["type"],
  sortOrder: number,
  createdAt = "2026-10-02T11:00:00Z",
) => ({ id, type, sort_order: sortOrder, created_at: createdAt }) as ItineraryItem;

test("day routes select the final hotel as the overnight endpoint, including at capacity", () => {
  const previousHotel = item("previous", "hotel", 0);
  const hotels = [item("early-hotel", "hotel", 1), item("overnight", "hotel", 100)];
  const activities = Array.from({ length: 25 }, (_, index) =>
    item(`activity-${index}`, "activity", index + 2),
  );
  const draft = defaultDayRouteDraft([hotels[0], ...activities, hotels[1]], "walk", previousHotel);
  assert.equal(draft.itemIds.length, 20);
  assert.equal(draft.itemIds[0], "previous");
  assert.equal(draft.itemIds.at(-1), "overnight");
  assert.equal(draft.legModes.length, 19);
});

test("newly added hotels join saved routes while explicit old omissions remain authoritative", () => {
  const activity = item("activity", "activity", 1, "2026-10-02T09:00:00Z");
  const omitted = item("omitted-hotel", "hotel", 2, "2026-10-02T09:00:00Z");
  const hotel = item("new-hotel", "hotel", 3);
  const result = synchronizeSavedDayRouteDraft(
    { itemIds: [activity.id], legModes: [] },
    [activity, omitted, hotel],
    "walk",
    "2026-10-02T10:00:00Z",
  );
  assert.deepEqual(result.addedItemIds, [hotel.id]);
  assert.deepEqual(result.draft.itemIds, [activity.id, hotel.id]);
});

test("a new overnight hotel keeps the last free route slot ahead of other new stops", () => {
  const old = Array.from({ length: 19 }, (_, index) =>
    item(`old-${index}`, "activity", index, "2026-10-02T09:00:00Z"),
  );
  const extra = item("new-activity", "activity", 19);
  const hotel = item("new-hotel", "hotel", 20);
  const result = synchronizeSavedDayRouteDraft(
    { itemIds: old.map(({ id }) => id), legModes: Array(18).fill("walk") },
    [...old, extra, hotel],
    "walk",
    "2026-10-02T10:00:00Z",
  );
  assert.deepEqual(result.addedItemIds, [hotel.id]);
  assert.equal(result.draft.itemIds.at(-1), hotel.id);
  assert.equal(result.draft.itemIds.length, 20);
});

test("calculation readiness matches distinct-coordinate validation before a provider call", () => {
  const hotel = { latitude: 35.1234567, longitude: 139.1234567 };
  assert.equal(canCalculateRouteStops([hotel, hotel]), false);
  assert.equal(canCalculateRouteStops([hotel, { ...hotel, latitude: 35.12345671 }]), false);
  assert.equal(canCalculateRouteStops([hotel, { ...hotel, latitude: 35.123457 }]), true);
  assert.equal(canCalculateRouteStops([hotel, undefined]), false);
  assert.equal(canCalculateRouteStops([hotel, { latitude: null, longitude: 139 }]), false);
  assert.equal(canCalculateRouteStops([hotel, { latitude: 95, longitude: 139 }]), false);
  assert.equal(canCalculateRouteStops([hotel]), false);
  assert.equal(canCalculateRouteStops(Array(21).fill(hotel)), false);
});

test("recently mapped or moved hotels join existing day routes with the previous overnight first", () => {
  const updatedAt = "2026-10-02T11:00:00Z";
  const previous = {
    ...item("previous-hotel", "hotel", 1, "2026-10-02T08:00:00Z"),
    updated_at: updatedAt,
  };
  const current = {
    ...item("current-hotel", "hotel", 3, "2026-10-02T08:00:00Z"),
    updated_at: updatedAt,
  };
  const activity = item("activity", "activity", 2, "2026-10-02T08:00:00Z");
  const result = synchronizeSavedDayRouteDraft(
    { itemIds: [activity.id], legModes: [] },
    [activity, current],
    "walk",
    "2026-10-02T10:00:00Z",
    previous,
  );
  assert.deepEqual(result.draft.itemIds, [previous.id, activity.id, current.id]);
});
