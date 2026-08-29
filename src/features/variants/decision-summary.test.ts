import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";
import { wgs84Coordinates } from "../../lib/providers/maps/types.ts";
import type { CalculatedRouteLeg } from "../../lib/providers/routes/types.ts";
import type { Json } from "../../types/database.ts";
import {
  resolveRouteCalculationConfigFromProjection,
  type RouteConfigPlanInput,
  type RouteConfigProjectionInput,
} from "../routes/plan-config.ts";
import { buildRouteConfigSignature } from "../routes/signatures.ts";
import { dayRouteStatusFromProjection } from "../routes/status.ts";
import {
  compareHotelOccurrences,
  derivePlanningHorizon,
  deriveVariantDecisionSummaryProjections,
  finalizeVariantDecisionSummaries,
  reconcileDecisionSummaryProjections,
} from "./decision-summary-metrics.ts";
import { decisionSummaryMetricVisibility } from "./decision-summary-presentation.ts";
import { consecutiveHotelStays } from "./decision-summary-hotel-stays.ts";
import {
  decisionSummaryCostDates,
  groupDecisionSummaryCosts,
} from "./decision-summary-cost-groups.ts";
import type {
  DecisionSummaryDayRow,
  DecisionSummaryInput,
  DecisionSummaryItemRow,
  DecisionSummaryVariantRow,
  VariantDecisionSummaryProjection,
} from "./decision-summary-types.ts";

const tripId = "trip-summary";

test("comparison cost breakdown groups repeated items and merges disjoint date ranges", () => {
  const lines = [
    { date: "2026-02-10", dayNumber: 1, itemId: "a", amount: 100 },
    { date: "2026-02-11", dayNumber: 2, itemId: "b", amount: 100 },
    { date: "2026-02-12", dayNumber: 3, itemId: "c", amount: 100 },
    { date: "2026-02-14", dayNumber: 5, itemId: "d", amount: 100 },
  ].map((line) => ({
    ...line,
    convertedAmount: line.amount,
    convertedCurrency: "USD",
    currency: "USD",
    title: "Hotel Example",
    type: "hotel" as const,
  }));
  const groups = groupDecisionSummaryCosts(lines);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].amount, 400);
  assert.equal(groups[0].convertedAmount, 400);
  assert.equal(
    decisionSummaryCostDates(groups[0], "en", (day) => `Day ${day}`),
    "Feb 10–12, Feb 14",
  );
  assert.equal(
    decisionSummaryCostDates(groups[0], "zh-CN", (day) => `第${day}天`),
    "2月10日至12日, 2月14日",
  );
});

const variants: DecisionSummaryVariantRow[] = [
  {
    color: "#166534",
    created_at: "2026-08-01T00:00:00.000Z",
    id: "route-a",
    is_primary: true,
    name: "Route A",
  },
  {
    color: "#2563eb",
    created_at: "2026-08-02T00:00:00.000Z",
    id: "route-b",
    is_primary: false,
    name: "Route B",
  },
];

function day(
  id: string,
  variantId: string,
  dayNumber: number,
  date: string | null,
): DecisionSummaryDayRow {
  return { date, day_number: dayNumber, id, variant_id: variantId };
}

function item(
  id: string,
  variantId: string,
  dayId: string,
  type: DecisionSummaryItemRow["type"],
  overrides: Partial<DecisionSummaryItemRow> = {},
): DecisionSummaryItemRow {
  return {
    day_id: dayId,
    details: {},
    id,
    place: null,
    place_id: null,
    sort_order: 0,
    title: id,
    trip_id: tripId,
    type,
    variant_id: variantId,
    ...overrides,
  };
}

function placedItem(
  id: string,
  variantId: string,
  dayId: string,
  type: DecisionSummaryItemRow["type"],
  latitude: number,
  longitude: number,
  overrides: Partial<DecisionSummaryItemRow> = {},
): DecisionSummaryItemRow {
  const placeId = overrides.place_id ?? "place-" + id;
  return item(id, variantId, dayId, type, {
    place: {
      country_code: null,
      google_place_id: "google-" + placeId,
      id: placeId!,
      latitude,
      locality_name: null,
      longitude,
    },
    place_id: placeId,
    ...overrides,
  });
}

function baseInput(overrides: Partial<DecisionSummaryInput> = {}): DecisionSummaryInput {
  return {
    calculations: [],
    days: [],
    items: [],
    knownCostBreakdowns: {},
    knownCosts: {},
    legs: [],
    plans: [],
    stops: [],
    variants,
    ...overrides,
  };
}

function projectionForHotel(
  variantId: string,
  isPrimary: boolean,
  dayDates: VariantDecisionSummaryProjection["dayDates"],
  hotelOccurrences: VariantDecisionSummaryProjection["hotelOccurrences"],
): VariantDecisionSummaryProjection {
  return {
    citySequence: [],
    citySpanMeters: null,
    cityStageCount: 0,
    color: isPrimary ? "#166534" : "#2563eb",
    cost: {
      amount: null,
      complete: true,
      converted: false,
      currency: "USD",
      itemCount: 0,
      rateDate: null,
      unavailableCurrencies: [],
    },
    costBreakdown: [],
    dayCount: dayDates.length,
    dayDates,
    hotelOccurrences,
    isPrimary,
    knownCost: [],
    knownCostBreakdown: [],
    knownDayRouteDistanceMeters: null,
    knownDurationSeconds: null,
    name: isPrimary ? "Route A" : "Route B",
    nightCount: null,
    nightUnknownReason: "Dates incomplete",
    plannedPlaceOccurrenceCount: 0,
    routeCoverage: {
      current: 0,
      currentCalculatedLegCount: 0,
      fallbackLegCount: 0,
      needs_edit: 0,
      noRouteFallbackCount: 0,
      stale: 0,
      totalSavedPlans: 0,
      uncalculated: 0,
      unsupportedModeFallbackCount: 0,
      updating: 0,
    },
    savedDayRouteDistanceByMode: [],
    uniqueCityPlaceCount: 0,
    uniquePlannedPlaces: 0,
    unknownDurationLegCount: 0,
    variantId,
  };
}

function routeLeg(
  position: number,
  distanceMeters: number,
  durationSeconds: number | null,
  source: "google" | "straight",
  fallbackReason?: "unsupported_mode" | "no_route",
): CalculatedRouteLeg {
  return {
    computedAt: "2026-08-04T00:00:00.000Z",
    distanceMeters,
    durationSeconds,
    fallbackReason,
    geometry:
      source === "google"
        ? {
            coordinateSystem: "wgs84",
            encodedPolyline: "encoded",
            encoding: "polyline5",
            provider: "google",
            source: "encoded",
          }
        : {
            coordinateSystem: "wgs84",
            destination: wgs84Coordinates(2, 2),
            origin: wgs84Coordinates(1, 1),
            source,
          },
    legSignature: "leg-" + position,
    mode: position === 1 ? "walk" : "train",
    position,
    providerMode: source === "google" ? "WALK" : null,
    warnings: [],
  };
}

test("Phase 5C projection is trip-scoped, RLS-protected, lightweight, and deterministic", async () => {
  const loader = await readFile(new URL("./decision-summary-data.ts", import.meta.url), "utf8");
  const schema = await readFile(
    new URL("../../../supabase/migrations/20260729160000_initial_schema.sql", import.meta.url),
    "utf8",
  );
  const routeSchema = await readFile(
    new URL(
      "../../../supabase/migrations/20260802130101_add_manual_day_route_plans.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const input = baseInput({
    days: [
      day("a-2", "route-a", 2, "2026-09-02"),
      day("a-1", "route-a", 1, "2026-09-01"),
      day("b-1", "route-b", 1, null),
    ],
  });
  const summaries = deriveVariantDecisionSummaryProjections(input);

  assert.deepEqual(
    summaries.map(({ variantId }) => variantId),
    ["route-a", "route-b"],
  );
  assert.equal(summaries[0].dayCount, 2, "days with no items remain in the horizon");
  for (const table of ["route_variants", "itinerary_items", "day_route_plans"])
    assert.match(
      loader,
      new RegExp('\\.from\\("' + table + '"\\)[\\s\\S]*\\.eq\\("trip_id", tripId\\)'),
    );
  assert.match(loader, /\.from\("trip_days"\)[\s\S]*\.in\("variant_id", variantIds\)/);
  for (const table of ["day_route_stops", "day_route_legs", "day_route_calculations"])
    assert.match(loader, new RegExp('\\.from\\("' + table + '"\\)'));
  assert.match(loader, /\.in\("type", \[\.\.\.decisionSummaryItemTypes\]\)/);
  assert.match(loader, /place:places\([\s\S]*latitude,[\s\S]*longitude/);
  assert.doesNotMatch(
    loader,
    /item_links|provider_data|booking|notes|PlannerWorkspace|display_name|formatted_address|computed_at/,
  );
  assert.doesNotMatch(loader, /service[_-]?role|admin|createService/iu);
  for (const policy of [
    "route_variants_select_members",
    "trip_days_select_members",
    "places_select_members",
    "itinerary_items_select_members",
  ])
    assert.match(schema, new RegExp('create policy "' + policy + '"[\\s\\S]*is_trip_member'));
  for (const policy of [
    "day_route_plans_select_members",
    "day_route_stops_select_members",
    "day_route_legs_select_members",
    "day_route_calculations_select_members",
  ])
    assert.match(routeSchema, new RegExp('create policy "' + policy + '"[\\s\\S]*is_trip_member'));
});

test("decision-summary locality metrics collapse adjacent stages and preserve later returns", () => {
  const days = [
    day("a-1", "route-a", 1, "2026-09-01"),
    day("a-2", "route-a", 2, "2026-09-02"),
    day("a-3", "route-a", 3, "2026-09-03"),
    day("a-4", "route-a", 4, "2026-09-04"),
  ];
  const tokyo = placedItem("tokyo-1", "route-a", "a-1", "location", 35.6762, 139.6503, {
    place_id: "tokyo",
    sort_order: 1,
    title: "Tokyo",
  });
  const kyoto = placedItem("kyoto-1", "route-a", "a-1", "location", 35.0116, 135.7681, {
    place_id: "kyoto",
    sort_order: 2,
    title: "Kyoto",
  });
  const kyotoStay = placedItem("kyoto-2", "route-a", "a-3", "location", 35.0116, 135.7681, {
    place_id: "kyoto",
    title: "Kyoto",
  });
  const tokyoReturn = placedItem("tokyo-2", "route-a", "a-4", "location", 35.6762, 139.6503, {
    place_id: "tokyo",
    title: "Tokyo",
  });
  const summary = deriveVariantDecisionSummaryProjections(
    baseInput({ days, items: [kyoto, tokyo, kyotoStay, tokyoReturn] }),
  )[0];
  const oneLeg = haversineDistanceMeters(
    { latitude: 35.6762, longitude: 139.6503 },
    { latitude: 35.0116, longitude: 135.7681 },
  );

  assert.deepEqual(summary.citySequence, ["Tokyo", "Kyoto", "Tokyo"]);
  assert.equal(summary.cityStageCount, 3);
  assert.equal(summary.uniqueCityPlaceCount, 2);
  assert.ok(Math.abs(summary.citySpanMeters! - oneLeg * 2) < 1);
  assert.equal(summary.dayCount, 4, "the City-less second day remains in the horizon");

  const noCities = deriveVariantDecisionSummaryProjections(
    baseInput({ days: [day("a-1", "route-a", 1, null)] }),
  )[0];
  assert.deepEqual(noCities.citySequence, []);
  assert.equal(noCities.citySpanMeters, null);
});

test("Phase 5C planning horizon derives nights only from continuous fully dated days", () => {
  assert.deepEqual(
    derivePlanningHorizon([
      day("d1", "route-a", 1, "2026-09-01"),
      day("d2", "route-a", 2, "2026-09-02"),
      day("d3", "route-a", 3, "2026-09-03"),
    ]),
    { dayCount: 3, nightCount: 2, nightUnknownReason: null },
  );
  assert.equal(derivePlanningHorizon([day("d1", "route-a", 1, "2026-09-01")]).nightCount, 0);
  assert.deepEqual(
    derivePlanningHorizon([day("d1", "route-a", 1, "2026-09-01"), day("d2", "route-a", 2, null)]),
    { dayCount: 2, nightCount: null, nightUnknownReason: "Dates incomplete" },
  );
  assert.equal(
    derivePlanningHorizon([
      day("d1", "route-a", 1, "2026-09-01"),
      day("d2", "route-a", 2, "2026-09-03"),
    ]).nightUnknownReason,
    "Dates not continuous",
  );
  assert.equal(
    deriveVariantDecisionSummaryProjections(
      baseInput({
        days: [
          day("a-1", "route-a", 1, null),
          day("b-1", "route-b", 1, null),
          day("b-2", "route-b", 2, null),
        ],
      }),
    )[1].dayCount,
    2,
    "variant day counts stay independent",
  );
});

test("Phase 5C planned places deduplicate supported persisted place IDs only", () => {
  const days = [day("a-1", "route-a", 1, null)];
  const items = [
    placedItem("city", "route-a", "a-1", "location", 1, 1, { place_id: "shared" }),
    placedItem("activity", "route-a", "a-1", "activity", 1, 1, { place_id: "shared" }),
    placedItem("meal", "route-a", "a-1", "meal", 1, 1),
    placedItem("hotel", "route-a", "a-1", "hotel", 1, 1),
    placedItem("car", "route-a", "a-1", "car_rental", 1, 1),
    placedItem("transport", "route-a", "a-1", "transport", 1, 1),
    item("null-place", "route-a", "a-1", "activity"),
  ];
  const summary = deriveVariantDecisionSummaryProjections(baseInput({ days, items }))[0];

  assert.equal(summary.plannedPlaceOccurrenceCount, 5);
  assert.equal(summary.uniquePlannedPlaces, 4);
  assert.equal(summary.nightCount, null, "Hotel items never supply inferred nights");
});

test("Phase 5C route totals exclude fallback metrics while retaining fallback diagnostics", () => {
  const days = [
    day("a-1", "route-a", 1, null),
    day("a-2", "route-a", 2, null),
    day("a-3", "route-a", 3, null),
    day("a-4", "route-a", 4, null),
    day("a-5", "route-a", 5, null),
  ];
  const items = [
    placedItem("hotel", "route-a", "a-2", "hotel", 1, 1),
    placedItem("activity", "route-a", "a-2", "activity", 2, 2),
    placedItem("stale-a", "route-a", "a-3", "activity", 3, 3),
    placedItem("stale-b", "route-a", "a-3", "meal", 4, 4),
    placedItem("uncalc-a", "route-a", "a-4", "activity", 5, 5),
    placedItem("uncalc-b", "route-a", "a-4", "meal", 6, 6),
  ];
  const plans = [
    { day_id: "a-2", id: "current", trip_id: tripId, variant_id: "route-a" },
    { day_id: "a-3", id: "stale", trip_id: tripId, variant_id: "route-a" },
    { day_id: "a-4", id: "uncalculated", trip_id: tripId, variant_id: "route-a" },
    { day_id: "a-5", id: "needs-editing", trip_id: tripId, variant_id: "route-a" },
  ];
  const stops = [
    { id: "c1", item_id: "hotel", plan_id: "current", position: 1 },
    { id: "c2", item_id: "activity", plan_id: "current", position: 2 },
    { id: "c3", item_id: "hotel", plan_id: "current", position: 3 },
    { id: "s1", item_id: "stale-a", plan_id: "stale", position: 1 },
    { id: "s2", item_id: "stale-b", plan_id: "stale", position: 2 },
    { id: "u1", item_id: "uncalc-a", plan_id: "uncalculated", position: 1 },
    { id: "u2", item_id: "uncalc-b", plan_id: "uncalculated", position: 2 },
    { id: "n1", item_id: "deleted-item", plan_id: "needs-editing", position: 1 },
    { id: "n2", item_id: "activity", plan_id: "needs-editing", position: 2 },
  ];
  const legs = [
    {
      from_stop_id: "c1",
      mode: "walk",
      plan_id: "current",
      position: 1,
      to_stop_id: "c2",
    },
    {
      from_stop_id: "c2",
      mode: "train",
      plan_id: "current",
      position: 2,
      to_stop_id: "c3",
    },
    {
      from_stop_id: "s1",
      mode: "self_driving",
      plan_id: "stale",
      position: 1,
      to_stop_id: "s2",
    },
    {
      from_stop_id: "u1",
      mode: "walk",
      plan_id: "uncalculated",
      position: 1,
      to_stop_id: "u2",
    },
    {
      from_stop_id: "n1",
      mode: "walk",
      plan_id: "needs-editing",
      position: 1,
      to_stop_id: "n2",
    },
  ];
  const projection: RouteConfigProjectionInput = {
    days: days.map((row) => ({ dayNumber: row.day_number, id: row.id })),
    items: items.map((row) => ({
      coordinates: row.place ? wgs84Coordinates(row.place.latitude!, row.place.longitude!) : null,
      dayId: row.day_id,
      itemId: row.id,
      tripId: row.trip_id,
      type: row.type,
      variantId: row.variant_id,
    })),
  };
  const currentPlan: RouteConfigPlanInput = {
    ...plans[0],
    legs: legs
      .filter(({ plan_id }) => plan_id === "current")
      .map(({ from_stop_id, mode, position, to_stop_id }) => ({
        from_stop_id,
        mode: mode as "walk" | "train",
        position,
        to_stop_id,
      })),
    stops: stops.filter(({ plan_id }) => plan_id === "current"),
  };
  const resolved = resolveRouteCalculationConfigFromProjection(projection, currentPlan);
  assert.ok(resolved.config, "a same-day Hotel may be the duplicate first and final stop");
  const calculated = [
    routeLeg(1, 1_000, 600, "google"),
    routeLeg(2, 2_000, null, "straight", "no_route"),
  ];
  const input = baseInput({
    calculations: [
      {
        calculated_legs: calculated as unknown as Json,
        config_signature: buildRouteConfigSignature(resolved.config!),
        plan_id: "current",
      },
      {
        calculated_legs: [routeLeg(1, 90_000, 9_000, "google")] as unknown as Json,
        config_signature: "obsolete-signature",
        plan_id: "stale",
      },
    ],
    days,
    items,
    legs,
    plans,
    stops,
  });
  const summary = deriveVariantDecisionSummaryProjections(input)[0];

  assert.equal(summary.routeCoverage.totalSavedPlans, 4);
  assert.equal(summary.routeCoverage.current, 1);
  assert.equal(summary.routeCoverage.stale, 1);
  assert.equal(summary.routeCoverage.uncalculated, 1);
  assert.equal(summary.routeCoverage.needs_edit, 1);
  assert.equal(summary.knownDayRouteDistanceMeters, 1_000);
  assert.equal(summary.knownDurationSeconds, 600);
  assert.equal(summary.unknownDurationLegCount, 0);
  assert.equal(summary.routeCoverage.fallbackLegCount, 1);
  assert.equal(summary.routeCoverage.noRouteFallbackCount, 1);
  assert.equal(summary.routeCoverage.currentCalculatedLegCount, 2);
  assert.deepEqual(
    summary.savedDayRouteDistanceByMode.map(({ distanceMeters, mode }) => [mode, distanceMeters]),
    [["walk", 1_000]],
  );
});

test("shared route status signature reacts to coordinates, stop order, and modes but not title/time", () => {
  const projection: RouteConfigProjectionInput = {
    days: [
      { dayNumber: 1, id: "day-1" },
      { dayNumber: 2, id: "day-2" },
    ],
    items: [
      {
        coordinates: wgs84Coordinates(1, 1),
        dayId: "day-1",
        itemId: "hotel",
        tripId,
        type: "hotel",
        variantId: "route-a",
      },
      {
        coordinates: wgs84Coordinates(2, 2),
        dayId: "day-2",
        itemId: "activity",
        tripId,
        type: "activity",
        variantId: "route-a",
      },
    ],
  };
  const plan: RouteConfigPlanInput = {
    day_id: "day-2",
    legs: [
      {
        from_stop_id: "stop-1",
        mode: "walk",
        position: 1,
        to_stop_id: "stop-2",
      },
    ],
    stops: [
      { id: "stop-1", item_id: "hotel", position: 1 },
      { id: "stop-2", item_id: "activity", position: 2 },
    ],
    trip_id: tripId,
    variant_id: "route-a",
  };
  const resolved = resolveRouteCalculationConfigFromProjection(projection, plan);
  const current = {
    ...plan,
    calculation: { config_signature: buildRouteConfigSignature(resolved.config!) },
  };

  assert.equal(dayRouteStatusFromProjection(projection, current), "current");
  assert.equal(
    dayRouteStatusFromProjection(projection, { ...current, calculationState: "updating" }),
    "updating",
  );
  assert.equal(
    dayRouteStatusFromProjection(projection, { ...plan, calculation: null }),
    "uncalculated",
  );
  assert.equal(
    dayRouteStatusFromProjection(
      {
        ...projection,
        items: projection.items.map((entry) =>
          entry.itemId === "activity" ? { ...entry, coordinates: wgs84Coordinates(2.5, 2) } : entry,
        ),
      },
      current,
    ),
    "stale",
  );
  assert.equal(
    dayRouteStatusFromProjection(projection, {
      ...current,
      legs: [{ ...current.legs[0], mode: "self_driving" }],
    }),
    "stale",
  );
  assert.equal(
    dayRouteStatusFromProjection(projection, {
      ...current,
      stops: current.stops.map((stop) => ({ ...stop, position: 3 - stop.position })),
    }),
    "needs_edit",
  );
  assert.equal(
    dayRouteStatusFromProjection(projection, current),
    "current",
    "title and time fields are deliberately absent from the signature projection",
  );
});

test("Phase 5C Hotel comparison supports place/title identity, date/day alignment, and multiplicity", () => {
  const primary = projectionForHotel(
    "route-a",
    true,
    [
      { date: "2026-09-01", dayNumber: 1 },
      { date: null, dayNumber: 2 },
    ],
    [
      {
        date: "2026-09-01",
        dayNumber: 1,
        identity: "place:hotel-1",
        itemId: "a1",
        placeId: "hotel-1",
        title: "Alpha",
      },
      {
        date: "2026-09-01",
        dayNumber: 1,
        identity: "title:beta hotel",
        itemId: "a2",
        placeId: null,
        title: " Beta Hotel ",
      },
      {
        date: null,
        dayNumber: 2,
        identity: "place:hotel-3",
        itemId: "a3",
        placeId: "hotel-3",
        title: "Gamma",
      },
    ],
  );
  const compared = projectionForHotel(
    "route-b",
    false,
    [
      { date: "2026-09-01", dayNumber: 1 },
      { date: null, dayNumber: 2 },
    ],
    [
      {
        date: "2026-09-01",
        dayNumber: 1,
        identity: "place:hotel-1",
        itemId: "b1",
        placeId: "hotel-1",
        title: "Renamed Alpha",
      },
      {
        date: "2026-09-01",
        dayNumber: 1,
        identity: "title:delta",
        itemId: "b2",
        placeId: null,
        title: "Delta",
      },
      {
        date: null,
        dayNumber: 2,
        identity: "place:hotel-4",
        itemId: "b3",
        placeId: "hotel-4",
        title: "Epsilon",
      },
      {
        date: null,
        dayNumber: 2,
        identity: "title:extra",
        itemId: "b4",
        placeId: null,
        title: "Extra",
      },
    ],
  );
  const difference = compareHotelOccurrences(primary, compared);

  assert.equal(difference.same, 1, "place identity wins over a renamed title");
  assert.equal(difference.changed, 2);
  assert.equal(difference.added, 1);
  assert.equal(difference.removed, 0);
  assert.deepEqual(difference.affectedLabels, ["2026-09-01", "Day 2"]);

  const dateMismatch = compareHotelOccurrences(
    projectionForHotel(
      "route-a",
      true,
      [{ date: "2026-09-01", dayNumber: 1 }],
      [primary.hotelOccurrences[0]],
    ),
    projectionForHotel(
      "route-b",
      false,
      [{ date: "2026-09-02", dayNumber: 1 }],
      [{ ...compared.hotelOccurrences[0], date: "2026-09-02" }],
    ),
  );
  assert.equal(dateMismatch.added, 1);
  assert.equal(dateMismatch.removed, 1);
});

test("Decision summary merges consecutive occurrences of the same Hotel", () => {
  const stays = consecutiveHotelStays([
    {
      date: "2026-07-17",
      dayNumber: 1,
      identity: "place:hotel-a",
      itemId: "hotel-a-1",
      placeId: "hotel-a",
      title: "Hotel A",
    },
    {
      date: "2026-07-18",
      dayNumber: 2,
      identity: "place:hotel-a",
      itemId: "hotel-a-2",
      placeId: "hotel-a",
      title: "Hotel A",
    },
    {
      date: "2026-07-19",
      dayNumber: 3,
      identity: "place:hotel-b",
      itemId: "hotel-b-3",
      placeId: "hotel-b",
      title: "Hotel B",
    },
  ]);
  assert.equal(stays.length, 2);
  assert.equal(stays[0].start.dayNumber, 1);
  assert.equal(stays[0].end.dayNumber, 2);
  assert.equal(stays[1].title, "Hotel B");
});

test("Phase 5C neutral deltas preserve unknowns, partial duration, and baseline semantics", () => {
  const primary = projectionForHotel("route-a", true, [], []);
  const compared = projectionForHotel("route-b", false, [], []);
  Object.assign(primary, {
    citySpanMeters: 1_000,
    cityStageCount: 3,
    dayCount: 5,
    knownDayRouteDistanceMeters: 5_000,
    knownDurationSeconds: 3_600,
    nightCount: null,
    savedDayRouteDistanceByMode: [
      { distanceMeters: 2_000, label: "Walk", mode: "walk" },
      { distanceMeters: 3_000, label: "Train", mode: "train" },
    ],
    uniqueCityPlaceCount: 2,
    uniquePlannedPlaces: 6,
    unknownDurationLegCount: 0,
  });
  Object.assign(compared, {
    citySpanMeters: 750,
    cityStageCount: 4,
    dayCount: 4,
    knownDayRouteDistanceMeters: null,
    knownDurationSeconds: 3_900,
    nightCount: 3,
    savedDayRouteDistanceByMode: [],
    uniqueCityPlaceCount: 2,
    uniquePlannedPlaces: 8,
    unknownDurationLegCount: 1,
  });
  const final = finalizeVariantDecisionSummaries([primary, compared])[1];

  assert.equal(final.deltas?.days, -1);
  assert.equal(final.deltas?.cityStages, 1);
  assert.equal(final.deltas?.citySpanMeters, -250);
  assert.equal(final.deltas?.uniqueCityPlaces, 0);
  assert.equal(final.deltas?.nights, null);
  assert.equal(final.deltas?.knownDayRouteDistanceMeters, null);
  assert.equal(final.deltas?.dayRouteDistanceByMode, null);
  assert.equal(
    final.deltas?.knownDurationSeconds,
    null,
    "partial durations do not get fake deltas",
  );
});

test("Phase 5C exposes only known saved distance modes", () => {
  const primary = projectionForHotel("route-a", true, [], []);
  const compared = projectionForHotel("route-b", false, [], []);
  const hidden = decisionSummaryMetricVisibility(
    finalizeVariantDecisionSummaries([primary, compared]),
  );

  assert.deepEqual(hidden.routeDistanceModes, []);

  compared.knownDayRouteDistanceMeters = 4_000;
  compared.savedDayRouteDistanceByMode = [
    { distanceMeters: 1_500, label: "Walk", mode: "walk" },
    { distanceMeters: 2_500, label: "Drive", mode: "self_driving" },
  ];
  const visible = decisionSummaryMetricVisibility(
    finalizeVariantDecisionSummaries([primary, compared]),
  );

  assert.deepEqual(
    visible.routeDistanceModes.map(({ mode }) => mode),
    ["walk", "self_driving"],
  );
});

test("Phase 5C saved route distance deltas stay neutral and mode-specific", () => {
  const primary = projectionForHotel("route-a", true, [], []);
  const compared = projectionForHotel("route-b", false, [], []);
  primary.knownDayRouteDistanceMeters = 5_000;
  primary.savedDayRouteDistanceByMode = [
    { distanceMeters: 2_000, label: "Walk", mode: "walk" },
    { distanceMeters: 3_000, label: "Train", mode: "train" },
  ];
  compared.knownDayRouteDistanceMeters = 4_000;
  compared.savedDayRouteDistanceByMode = [
    { distanceMeters: 3_000, label: "Walk", mode: "walk" },
    { distanceMeters: 1_000, label: "Drive", mode: "self_driving" },
  ];

  const distanceDeltas = finalizeVariantDecisionSummaries([primary, compared])[1].deltas
    ?.dayRouteDistanceByMode;
  assert.ok(distanceDeltas);
  assert.deepEqual(
    distanceDeltas.map(({ distanceMeters, mode }) => [mode, distanceMeters]),
    [
      ["walk", 1_000],
      ["self_driving", 1_000],
      ["train", -3_000],
    ],
  );
});

test("Phase 5C cached summaries reconcile to authoritative variant identity and Primary", () => {
  const cached = deriveVariantDecisionSummaryProjections(
    baseInput({ days: [day("a-1", "route-a", 1, null), day("b-1", "route-b", 1, null)] }),
  );
  const reconciled = reconcileDecisionSummaryProjections(
    [
      {
        ...variants[1],
        color: "#f97316",
        is_primary: true,
        name: "New Primary",
        trip_id: tripId,
      },
      { ...variants[0], is_primary: false, name: "Renamed A", trip_id: tripId },
    ],
    cached,
  );

  assert.deepEqual(
    reconciled.map(({ name }) => name),
    ["New Primary", "Renamed A"],
  );
  assert.equal(reconciled[0].isPrimary, true);
  assert.equal(reconciled[0].color, "#f97316");
  assert.equal(
    reconcileDecisionSummaryProjections([{ ...variants[0], trip_id: tripId }], cached).length,
    1,
    "deleted cached variants are removed",
  );
});

test("Phase 5C UI is isolated, responsive, accessible, and makes zero provider calls", async () => {
  const ui = (
    await Promise.all(
      [
        "./components/decision-summary-card.tsx",
        "./components/decision-summary-card-elements.tsx",
        "./components/decision-summary-feedback.tsx",
        "./components/decision-summary-hotel-details.tsx",
        "./components/decision-summary-cost-details.tsx",
        "./components/decision-summary-route-details.tsx",
        "./components/route-variant-decision-summary-panel.tsx",
        "./components/route-variant-decision-summary-sheet.tsx",
        "./components/route-variant-comparison-panel.tsx",
        "./components/variant-comparison-mobile-bar.tsx",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
  const hook = await readFile(
    new URL("./use-variant-decision-summary.ts", import.meta.url),
    "utf8",
  );
  const query = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
  const mapHook = await readFile(
    new URL("../itinerary/hooks/use-planner-map.ts", import.meta.url),
    "utf8",
  );
  const mutations = (
    await Promise.all(
      [
        "../itinerary/item-mutations.ts",
        "../itinerary/day-mutations.ts",
        "../routes/queries.ts",
        "./queries.ts",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");

  assert.match(hook, /variants\.length >= 2/);
  assert.match(query, /\["variant-decision-summary", tripId\]/);
  assert.match(ui, /Comparison summary/);
  assert.match(ui, /message=\{"Primary"\}/);
  assert.match(ui, /Localized value="Editing"/);
  assert.doesNotMatch(ui, /Localized value=\{isActive \? "Editing" : "Read only"\}/);
  assert.doesNotMatch(ui, /Price breakdown/);
  assert.match(ui, /icon=\{MapPin\}[\s\S]*label="Cities"/);
  assert.match(ui, /icon=\{CalendarDays\}[\s\S]*label="Days & nights"/);
  assert.match(ui, /DecisionSummaryCostDetails/);
  assert.match(ui, /message="Breakdown"/);
  assert.doesNotMatch(ui, /Known Cost/);
  assert.match(ui, /Route details/);
  assert.doesNotMatch(ui, /Saved distance by mode|message=\{" distance"\}/);
  assert.match(ui, /flex flex-wrap items-center gap-x-4/);
  assert.doesNotMatch(ui, /overflow-x-auto/);
  assert.doesNotMatch(ui, /Trip transport items/);
  assert.doesNotMatch(ui, /Known day-route distance|Known duration|Nights unknown/);
  assert.doesNotMatch(ui, /Route coverage|Explicit saved leg modes|excluded from totals/);
  assert.match(ui, /Retry summary/);
  assert.match(ui, /min-h-11/);
  assert.match(ui, /min-\[900px\]/);
  assert.match(ui, /<PullUpPanel/);
  assert.match(ui, /Hotels/);
  assert.match(ui, /consecutiveHotelStays/);
  assert.match(ui, /compactHeader/);
  assert.doesNotMatch(ui, /Hotel changed|Hotel added|Hotel removed|Explicit Hotel items only/);
  assert.match(ui, /aria-label|aria-expanded/);
  assert.match(mapHook, /decisionSummaryPanelOpen \|\| decisionSummarySheetOpen/);
  assert.match(mutations, /invalidateVariantDecisionSummary/);
  assert.doesNotMatch(
    ui + hook + query + mapHook,
    /router\.push|variantHref|calculateOverviewRoute|calculateDayRoute|googleRoutesEndpoint|routes\.googleapis|Place Details|findPlace|winner|loser|recommend/i,
  );
  assert.doesNotMatch(ui, /combined distance|\bscore\b|Export summary|Share summary/i);
});
