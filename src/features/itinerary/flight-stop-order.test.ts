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
  const hotel = { id: "hotel", type: "hotel", sort_order: 10 } as unknown as ItineraryItem;
  const museum = { id: "museum", type: "activity", sort_order: 11 } as unknown as ItineraryItem;
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

test("NZ final day sorts whole flights as well as endpoint activities without rewriting saved positions", () => {
  const late = {
    id: "akl-sha",
    type: "flight",
    start_time: "21:20:00",
    sort_order: 2,
    details: { departureDate: "2027-04-10" },
  } as unknown as ItineraryItem;
  const early = {
    id: "chc-akl",
    type: "flight",
    start_time: "14:05:00",
    sort_order: 4,
    details: { departureDate: "2027-04-10" },
  } as unknown as ItineraryItem;
  const items = [
    stop("chc", early.id, "departure", "2027-04-10", "14:05:00", 0),
    stop("akl-arrival", early.id, "arrival", "2027-04-10", "15:30:00", 1),
    late,
    stop("akl-departure", late.id, "departure", "2027-04-10", "21:20:00", 3),
    early,
    stop("sha", late.id, "arrival", "2027-04-11", "15:25:00", 5),
  ];
  assert.deepEqual(
    orderOwnerFlightStops(items)
      .filter((item) => item.type === "flight")
      .map((item) => item.id),
    [early.id, late.id],
  );
  assert.deepEqual(
    items.filter((item) => item.type === "flight").map((item) => item.sort_order),
    [2, 4],
  );
  const day = {
    items: items.map((item) => ({
      ref: item.id,
      type: item.type,
      startTime: item.start_time,
      sortOrder: item.sort_order,
    })),
  } as PublicItineraryDay;
  assert.deepEqual(
    orderedPublicItems(day)
      .filter((item) => item.type === "flight")
      .map((item) => item.ref),
    [early.id, late.id],
  );
});

test("whole flight cards use departure dates before times and preserve unrelated item gaps", () => {
  const flight = (id: string, date: string, time: string) => ({
    id,
    type: "flight",
    start_time: time,
    details: { departureDate: date },
  });
  const items = [
    flight("late-day", "2027-04-11", "01:00"),
    { id: "meal", type: "meal" },
    flight("early-day", "2027-04-10", "21:20"),
  ];
  assert.deepEqual(
    orderOwnerFlightStops(items).map((item) => item.id),
    ["early-day", "meal", "late-day"],
  );
});
