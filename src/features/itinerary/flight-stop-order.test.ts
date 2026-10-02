import assert from "node:assert/strict";
import { test } from "node:test";
import {
  insertedActivityOrderIds,
  itemOrderAnchor,
  orderedDestinationActivities,
} from "./activity-order.ts";
import { orderOwnerFlightStops } from "./flight-stop-order.ts";
import type { ItineraryItem, PlannerDay } from "./types.ts";
import { eligibleDayRouteItems } from "../routes/day-route-map.ts";
import { orderedPublicItems } from "../sharing/presentation.ts";
import { publicDayRoutePlan } from "../sharing/public-map-model.ts";
import type { PublicItinerary, PublicItineraryDay } from "../sharing/types.ts";

const stop = (
  id: string,
  parent: string,
  role: "departure" | "arrival",
  date: string,
  time: string,
  sort_order: number,
) =>
  ({
    id,
    type: "activity",
    title: id,
    sort_order,
    start_time: time,
    details: { flightEndpointParentId: parent, flightEndpointRole: role, flightEndpointDate: date },
    place: { id, displayName: id, latitude: 35 + sort_order, longitude: 139 },
  }) as unknown as ItineraryItem;
const flightStops = () => [
  stop("paris-departure", "flight1", "departure", "2027-02-14", "08:25:00", 0),
  stop("brussels-departure", "flight2", "departure", "2027-02-14", "12:20:00", 1),
  stop("brussels-arrival", "flight1", "arrival", "2027-02-14", "09:25:00", 2),
  stop("beijing-arrival", "flight2", "arrival", "2027-02-15", "04:40:00", 3),
];
const expected = ["paris-departure", "brussels-arrival", "brussels-departure", "beijing-arrival"];

test("two flights in the same Plan day follow dates and times, including overnight arrival", () => {
  const items = flightStops();
  assert.deepEqual(
    orderedDestinationActivities(items).map(({ id }) => id),
    expected,
  );
  assert.deepEqual(
    eligibleDayRouteItems({ items } as PlannerDay).map(({ id }) => id),
    expected,
  );
  assert.deepEqual(
    items.map(({ sort_order }) => sort_order),
    [0, 1, 2, 3],
    "sorting does not mutate saved rows",
  );
});

test("ordinary activity gaps stay explicit and new activities default after the final arrival", () => {
  const items = flightStops();
  const hotel = { id: "hotel", type: "hotel", sort_order: 10 } as ItineraryItem;
  const museum = { id: "museum", type: "activity", sort_order: 11 } as ItineraryItem;
  assert.equal(itemOrderAnchor([...items, hotel], undefined, "activity"), "beijing-arrival");
  assert.deepEqual(insertedActivityOrderIds([...items, hotel], museum), [
    ...expected,
    "museum",
    "hotel",
  ]);
  const manual = [...items.slice(0, 1), museum, ...items.slice(1)];
  assert.equal(
    orderOwnerFlightStops(manual)[1].id,
    "museum",
    "an existing explicit activity gap is preserved",
  );
});

test("the same flight keeps departure before arrival without a time or across a date-line clock reversal", () => {
  const departure = stop("departure", "flight", "departure", "2027-02-15", "08:00", 2);
  const arrival = stop("arrival", "flight", "arrival", "2027-02-14", "20:00", 1);
  assert.deepEqual(
    orderOwnerFlightStops([arrival, departure]).map(({ id }) => id),
    ["departure", "arrival"],
  );
  assert.deepEqual(
    orderOwnerFlightStops([
      { ...arrival, start_time: null },
      { ...departure, start_time: null },
    ]).map(({ id }) => id),
    ["departure", "arrival"],
  );
});

test("Shareable presentation and day route use the same two-flight chronological order", () => {
  const items = flightStops().map((item) => ({
    ref: item.id,
    type: item.type,
    title: item.title,
    sortOrder: item.sort_order,
    startTime: item.start_time,
    place: item.place,
    flightEndpoint: {
      role: (item.details as { flightEndpointRole: "departure" | "arrival" }).flightEndpointRole,
      date: (item.details as { flightEndpointDate: string }).flightEndpointDate,
    },
  }));
  const day = { ref: "day", items } as unknown as PublicItineraryDay;
  assert.deepEqual(
    orderedPublicItems(day).map(({ ref }) => ref),
    expected,
  );
  assert.deepEqual(
    publicDayRoutePlan({ days: [day] } as PublicItinerary, "day").items.map(({ ref }) => ref),
    expected,
  );
});
