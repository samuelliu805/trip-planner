import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  deduplicatePlaceSnapshots,
  normalizeGooglePlace,
} from "../../lib/providers/places/normalize.ts";
import { RouteProviderError } from "../../lib/providers/routes/errors.ts";
import { straightFallbackLeg } from "../../lib/providers/routes/fallback.ts";
import { decodeEncodedPolyline, haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";
import {
  createGoogleRoutesProvider,
  googleRoutesEndpoint,
  googleRoutesFieldMask,
  parseGoogleDurationSeconds,
} from "../../lib/providers/routes/google-routes-core.ts";
import { googleTravelMode } from "../../lib/providers/routes/mode-mapping.ts";
import type { RouteLegRequest } from "../../lib/providers/routes/types.ts";

import { buildCopyRows, normalizedTimes, scheduleKind } from "./mutation-helpers.ts";
import {
  encodePlannerClipboard,
  fillTargetRows,
  initialPlannerSelection,
  moveGridFocus,
  parsePlannerClipboard,
  selectionBounds,
  selectionContains,
} from "./grid-interactions.ts";
import { mergeMarkerDateRanges } from "../maps/marker-date-ranges.ts";
import {
  buildOverviewRouteLines,
  deriveOverviewStages,
  isOverviewRouteLeg,
} from "../routes/overview.ts";
import {
  neighboringCityConflict,
  neighboringCityConflictAfterRemoving,
  orderedCityOccurrences,
  prospectiveNeighboringCityConflict,
} from "../routes/city-order.ts";
import {
  deriveOverviewDefaultModes,
  overviewFlightThresholdMeters,
} from "../routes/overview-transport.ts";
import {
  buildDayRouteLines,
  buildDayRouteMarkers,
  eligibleDayRouteItems,
} from "../routes/day-route-map.ts";
import { buildDayCityMarkers, buildDayCityRouteLines } from "../routes/day-city-map.ts";
import { validateDayRouteDraft } from "../routes/route-config.ts";
import { calculateRouteConfiguration } from "../routes/calculator.ts";
import { buildRouteConfigSignature } from "../routes/signatures.ts";
import { resolveRouteCalculationConfig } from "../routes/plan-config.ts";
import { dayRouteStatus } from "../routes/status.ts";
import { suggestedDraftLegMode } from "../routes/transport-suggestion.ts";
import { overviewRouteModes, routeLegModes, type DayRouteDraft } from "../routes/types.ts";
import type { DayRouteCalculation, DayRoutePlan, RouteCalculationConfig } from "../routes/types.ts";
import type { CalculatedRouteLeg } from "../../lib/providers/routes/types.ts";
import {
  carRentalDetailsSchema,
  clearItineraryItemsSchema,
  copyItineraryItemsSchema,
  createItineraryItemSchema,
  deleteItineraryItemSchema,
  insertTripDaySchema,
  removeTripDaySchema,
  reorderItineraryItemsSchema,
  updateItineraryItemSchema,
} from "./schema.ts";
import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "./types.ts";
import { resolveActiveVariant, variantHref } from "../variants/active.ts";
import "../variants/comparison.test.ts";
import "../variants/decision-summary.test.ts";
import "../sharing/sharing.test.ts";

async function readItineraryQueryModules() {
  return (
    await Promise.all(
      ["./queries.ts", "./planner-query.ts", "./item-mutations.ts", "./day-mutations.ts"].map(
        (path) => readFile(new URL(path, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
}

const ids = {
  day: "00000000-0000-4000-8000-000000000003",
  item: "00000000-0000-4000-8000-000000000004",
  targetDay: "00000000-0000-4000-8000-000000000005",
  trip: "00000000-0000-4000-8000-000000000001",
  variant: "00000000-0000-4000-8000-000000000002",
};

const base = {
  dayId: ids.day,
  details: {},
  title: "Museum",
  tripId: ids.trip,
  type: "activity" as const,
  variantId: ids.variant,
};

const routeStop = (
  itemId: string,
  type: string,
  latitude: number,
  longitude: number,
): DayRouteDraft["stops"][number] => ({
  coordinates: { latitude, longitude },
  dayId: ids.day,
  itemId,
  tripId: ids.trip,
  type,
  variantId: ids.variant,
});

const routeDraft = (overrides: Partial<DayRouteDraft> = {}): DayRouteDraft => ({
  dayId: ids.day,
  legModes: ["walk"],
  stops: [
    routeStop("00000000-0000-4000-8000-000000000010", "activity", 37.7749, -122.4194),
    routeStop("00000000-0000-4000-8000-000000000011", "meal", 37.7849, -122.4094),
  ],
  tripId: ids.trip,
  variantId: ids.variant,
  ...overrides,
});

const providerLeg = (mode: DayRouteDraft["legModes"][number] = "walk"): RouteLegRequest => ({
  destination: { latitude: 34.0522, longitude: -118.2437 },
  legSignature: "leg-signature",
  mode,
  origin: { latitude: 37.7749, longitude: -122.4194 },
  position: 1,
});

test("planner initially selects the first City cell", () => {
  assert.deepEqual(initialPlannerSelection(3, 0), { column: 0, row: 0 });
  assert.deepEqual(initialPlannerSelection(0, 0), { column: -1, row: -1 });
  assert.deepEqual(initialPlannerSelection(3, -1), { column: -1, row: -1 });
});

test("active variant resolution honors a valid query and safely falls back to primary", () => {
  const primary = {
    color: "#0f766e",
    id: ids.variant,
    is_primary: true,
    name: "Route A",
    trip_id: ids.trip,
  };
  const routeB = {
    ...primary,
    color: "#2563eb",
    id: "00000000-0000-4000-8000-000000000020",
    is_primary: false,
    name: "Route B",
  };
  assert.deepEqual(resolveActiveVariant([primary, routeB], routeB.id), {
    activeVariant: routeB,
    usedFallback: false,
  });
  assert.deepEqual(resolveActiveVariant([primary, routeB]), {
    activeVariant: primary,
    usedFallback: false,
  });
  assert.deepEqual(
    resolveActiveVariant([primary, routeB], "00000000-0000-4000-8000-000000000099"),
    {
      activeVariant: primary,
      usedFallback: true,
    },
  );
  const broken = resolveActiveVariant([{ ...routeB }]);
  assert.equal("error" in broken, true);
  if ("error" in broken) assert.match(broken.error, /exactly one primary/);
  assert.equal(variantHref(ids.trip, routeB.id), `/trips/${ids.trip}?variant=${routeB.id}`);
});

test("Phase 5A migration owns atomic lifecycle, isolation, primary, and grant contracts", async () => {
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260803173303_route_variant_foundation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const initial = await readFile(
    new URL("../../../supabase/migrations/20260729160000_initial_schema.sql", import.meta.url),
    "utf8",
  );
  const manualRoutes = await readFile(
    new URL(
      "../../../supabase/migrations/20260802130101_add_manual_day_route_plans.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const signature of [
    /create function public\.create_route_variant\([\s\S]*target_trip_id uuid,[\s\S]*source_variant_id uuid,[\s\S]*variant_name text,[\s\S]*variant_color text/,
    /create function public\.duplicate_route_variant\([\s\S]*target_trip_id uuid,[\s\S]*source_variant_id uuid,[\s\S]*variant_name text,[\s\S]*variant_color text/,
    /create function public\.update_route_variant_metadata/,
    /create function public\.set_primary_route_variant/,
    /create function public\.delete_route_variant/,
  ])
    assert.match(migration, signature);

  const securityDefinerFunctions = [
    "create_route_variant",
    "duplicate_route_variant",
    "update_route_variant_metadata",
    "set_primary_route_variant",
    "delete_route_variant",
    "insert_variant_day",
    "remove_variant_day",
    "save_day_route_plan",
    "clear_day_route_plan",
  ];
  for (const name of securityDefinerFunctions) {
    const start = migration.indexOf(`function public.${name}(`);
    assert.notEqual(start, -1, `${name} must exist`);
    const end = migration.indexOf("\n$$;", start);
    const body = migration.slice(start, end);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.match(body, /auth\.uid\(\)/);
    assert.match(body, /owner_id|is_trip_owner/);
  }

  assert.match(migration, /route_variants_max_three/);
  assert.match(migration, /count\(\*\)[\s\S]*>= 3/);
  assert.match(migration, /route_variants_trip_name_ci_unique/);
  assert.match(migration, /lower\(btrim\(name\)\)/);
  assert.match(migration, /deferrable initially deferred/);
  assert.match(migration, /VARIANT_PRIMARY_REQUIRED/);
  assert.match(migration, /VARIANT_PRIMARY_DELETE_FORBIDDEN/);
  assert.match(migration, /VARIANT_FINAL_DELETE_FORBIDDEN/);
  assert.match(migration, /source\.trip_id = target_trip_id/);
  assert.match(migration, /VARIANT_SOURCE_NOT_FOUND/);

  for (const mapping of ["day_id_map", "item_id_map", "plan_id_map", "stop_id_map"])
    assert.match(migration, new RegExp(mapping));
  assert.match(migration, /new_day_id := gen_random_uuid\(\)/);
  assert.match(migration, /new_item_id := gen_random_uuid\(\)/);
  assert.match(migration, /new_plan_id := gen_random_uuid\(\)/);
  assert.match(migration, /new_stop_id := gen_random_uuid\(\)/);
  assert.match(migration, /source_item\.place_id/);
  assert.match(migration, /source_stop\.position/);
  assert.match(migration, /source_leg\.mode/);
  assert.match(migration, /mapped_from_stop_id/);
  assert.match(migration, /mapped_to_stop_id/);
  assert.match(migration, /day_route_calculations are intentionally not copied/);
  const duplicateBody = migration.slice(
    migration.indexOf("function public.duplicate_route_variant("),
    migration.indexOf("function public.update_route_variant_metadata("),
  );
  assert.doesNotMatch(duplicateBody, /insert into public\.places/);
  assert.doesNotMatch(duplicateBody, /insert into public\.day_route_calculations/);

  for (const table of ["route_variants", "trip_days", "itinerary_items", "places"])
    assert.match(initial, new RegExp(`alter table public\\.${table} enable row level security`));
  for (const table of [
    "day_route_plans",
    "day_route_stops",
    "day_route_legs",
    "day_route_calculations",
  ])
    assert.match(
      manualRoutes,
      new RegExp(`alter table public\\.${table} enable row level security`),
    );

  assert.match(
    migration,
    /revoke all on function public\.duplicate_route_variant[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.duplicate_route_variant[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(migration, /grant execute[^;]+to anon/);
  assert.match(
    migration,
    /revoke insert, update, delete[\s\S]*route_variants from anon, authenticated/,
  );
  assert.match(migration, /revoke insert, update, delete[\s\S]*trip_days from anon, authenticated/);
});

test("Phase 5A loading, cache, switch, and responsive UI contracts stay variant-aware", async () => {
  const page = await readFile(
    new URL("../../app/trips/[tripId]/page.tsx", import.meta.url),
    "utf8",
  );
  const data = await readFile(new URL("./data.ts", import.meta.url), "utf8");
  const queries = await readItineraryQueryModules();
  const routeQueries = await readFile(new URL("../routes/queries.ts", import.meta.url), "utf8");
  const workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  const mapHook = await readFile(new URL("./hooks/use-planner-map.ts", import.meta.url), "utf8");
  const dayRoute = await readFile(new URL("../routes/use-day-route.ts", import.meta.url), "utf8");
  const variantActions = await readFile(new URL("../variants/actions.ts", import.meta.url), "utf8");
  const controls = await readFile(
    new URL("../variants/components/route-variant-controls.tsx", import.meta.url),
    "utf8",
  );
  const variantSwitcher = await readFile(
    new URL("../variants/components/route-variant-switcher.tsx", import.meta.url),
    "utf8",
  );
  const variantManagement = await readFile(
    new URL("../variants/components/manage-route-variants-dialog.tsx", import.meta.url),
    "utf8",
  );
  const variantEditor = await readFile(
    new URL("../variants/components/route-variant-editor-dialog.tsx", import.meta.url),
    "utf8",
  );
  const variantIdentity = await readFile(
    new URL("../variants/components/route-variant-identity.tsx", import.meta.url),
    "utf8",
  );
  const variantUi = [
    controls,
    variantSwitcher,
    variantManagement,
    variantEditor,
    variantIdentity,
  ].join("\n");
  const variantQueries = await readFile(new URL("../variants/queries.ts", import.meta.url), "utf8");
  const toolbar = await readFile(
    new URL("./components/planner-toolbar.tsx", import.meta.url),
    "utf8",
  );
  const clearDialog = await readFile(
    new URL("./components/planner-clear-cells-dialog.tsx", import.meta.url),
    "utf8",
  );
  const workspaceEvents = await readFile(
    new URL("./components/planner-workspace-event-boundary.tsx", import.meta.url),
    "utf8",
  );
  const itineraryActions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  const tripsPage = await readFile(new URL("../../app/trips/page.tsx", import.meta.url), "utf8");
  const tripsData = await readFile(new URL("../trips/data.ts", import.meta.url), "utf8");

  assert.match(page, /resolveActiveVariant\(variantsResult\.data, query\.variant\)/);
  assert.match(page, /getPlannerWorkspace\(\s*tripId,\s*resolution\.activeVariant\.id/);
  assert.match(data, /getPlannerVariants/);
  assert.match(data, /select\("id, trip_id, name, color, is_primary"\)/);
  assert.match(data, /getPlannerWorkspace\(\s*tripId: string,\s*variantId: string/);
  assert.match(data, /\.eq\("id", variantId\)/);
  assert.match(queries, /\["planner", tripId, variantId\]/);
  assert.match(routeQueries, /plannerQueryKey\(tripId, variantId\)/);
  assert.match(workspace, /key=\{props\.initialWorkspace\.variant\.id\}/);
  assert.match(dayRoute, /useSaveDayRoutePlan\(tripId, variantId\)/);
  assert.match(dayRoute, /variantId: workspace\.variant\.id/);
  assert.match(mapHook, /overview:\$\{variantId\}/);

  assert.match(controls, /router\.push\(variantHref/);
  assert.match(variantUi, /<Sheet[\s\S]*side="bottom"/);
  assert.match(variantUi, /PrimaryBadge/);
  assert.match(variantUi, />\s*Primary\s*</);
  assert.match(variantUi, /Maximum of three variants reached/);
  assert.match(variantUi, /<AlertDialog/);
  assert.doesNotMatch(variantUi, /window\.confirm/);
  assert.match(variantUi, /min-h-11|h-11/);
  assert.match(variantUi, /z-\[90\]/);
  assert.match(variantUi, /is now the primary route/);
  assert.match(variantUi, /router\.refresh\(\)/);
  assert.match(variantQueries, /is_primary: variant\.id === input\.variantId/);
  assert.match(variantQueries, /onError:[\s\S]*context\?\.previous/);
  assert.match(workspaceEvents, /event\.key === "Backspace"/);
  assert.match(clearDialog, /<AlertDialog/);
  assert.match(clearDialog, /Saved day routes[\s\S]*will need editing/);
  assert.match(toolbar, />\s*Clear\s*</);
  assert.match(toolbar, /<div className="min-w-0">[\s\S]*\{trip\.title\}/);
  assert.match(toolbar, /Tap a date to select a day/);
  assert.match(itineraryActions, /rpc\("clear_route_variant_items"/);
  assert.match(
    variantUi,
    /wasActive[\s\S]*find\(\(\{ is_primary \}\) => is_primary\)[\s\S]*router\.push/,
  );
  assert.match(tripsData, /route_variants\(id, name, color, is_primary\)/);
  assert.match(tripsData, /\.eq\("route_variants\.is_primary", true\)/);
  assert.match(tripsPage, /primaryVariant\.name/);
  assert.match(tripsPage, /backgroundColor: primaryVariant\.color/);
  assert.doesNotMatch(tripsPage, />\s*Route A\s*</);
  assert.match(variantActions, /revalidatePath\("\/trips"\)/);

  assert.doesNotMatch(
    variantActions,
    /calculateDayRoute|calculateOverviewRoute|calculateGoogleRouteLeg/,
  );
  assert.doesNotMatch(variantUi, /calculateDayRoute|calculateOverviewRoute|routes\.googleapis/);
});

const googleResponse = () =>
  new Response(
    JSON.stringify({
      routes: [
        {
          distanceMeters: 12_345,
          duration: "901.4s",
          polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
        },
      ],
    }),
    { headers: { "Content-Type": "application/json" }, status: 200 },
  );

const calculationConfig = (): RouteCalculationConfig => ({
  dayId: ids.day,
  legModes: ["walk", "taxi"],
  stops: [
    { coordinates: { latitude: 37.7749, longitude: -122.4194 }, itemId: "hotel" },
    { coordinates: { latitude: 37.7849, longitude: -122.4094 }, itemId: "museum" },
    { coordinates: { latitude: 37.7949, longitude: -122.3994 }, itemId: "restaurant" },
  ],
  tripId: ids.trip,
  variantId: ids.variant,
});

const calculatedLeg = (
  request: RouteLegRequest,
  durationSeconds: number | null = 600,
): CalculatedRouteLeg => ({
  computedAt: "2026-08-02T00:00:00.000Z",
  distanceMeters: 1_000,
  durationSeconds,
  geometry: { destination: request.destination, origin: request.origin, source: "straight" },
  legSignature: request.legSignature,
  mode: request.mode,
  position: request.position,
  providerMode: null,
  warnings: [],
});

test("route signatures ignore display and schedule metadata but track route inputs", () => {
  const config = calculationConfig();
  const decorated = {
    ...config,
    stops: config.stops.map((stop, index) => ({
      ...stop,
      endTime: `${index + 10}:00`,
      notes: "Display only",
      startTime: `${index + 9}:00`,
      title: `Stop ${index}`,
    })),
  };
  assert.equal(buildRouteConfigSignature(config), buildRouteConfigSignature(decorated));
  assert.notEqual(
    buildRouteConfigSignature(config),
    buildRouteConfigSignature({
      ...config,
      stops: [config.stops[1], config.stops[0], config.stops[2]],
    }),
  );
  assert.notEqual(
    buildRouteConfigSignature(config),
    buildRouteConfigSignature({ ...config, legModes: ["bike", "taxi"] }),
  );
  assert.notEqual(
    buildRouteConfigSignature(config),
    buildRouteConfigSignature({
      ...config,
      stops: config.stops.map((stop, index) =>
        index === 1 ? { ...stop, coordinates: { ...stop.coordinates, latitude: 37.785 } } : stop,
      ),
    }),
  );
});

test("route calculation uses full cache hits and only recalculates changed legs", async () => {
  const config = calculationConfig();
  let calls = 0;
  const first = await calculateRouteConfiguration(config, null, async (request) => {
    calls += 1;
    return calculatedLeg(request);
  });
  assert.equal(first.cache, "miss");
  assert.equal(calls, 2);
  const previous: DayRouteCalculation = {
    calculatedLegs: first.legs,
    computed_at: "2026-08-02T00:00:00.000Z",
    config_signature: first.configSignature,
    plan_id: "plan",
    provider_schema_version: "routes-v1",
    total_distance_meters: first.totalDistanceMeters,
    total_duration_seconds: first.totalDurationSeconds,
  };

  calls = 0;
  const full = await calculateRouteConfiguration(config, previous, async (request) => {
    calls += 1;
    return calculatedLeg(request);
  });
  assert.equal(full.cache, "full");
  assert.equal(calls, 0);

  const changed: RouteCalculationConfig = { ...config, legModes: ["walk", "rideshare"] };
  calls = 0;
  const partial = await calculateRouteConfiguration(changed, previous, async (request) => {
    calls += 1;
    return calculatedLeg(request);
  });
  assert.equal(partial.cache, "partial");
  assert.equal(calls, 1);
});

test("failed recalculation leaves the prior snapshot untouched and caps concurrency", async () => {
  const config: RouteCalculationConfig = {
    ...calculationConfig(),
    legModes: ["walk", "walk", "walk", "walk", "walk"],
    stops: Array.from({ length: 6 }, (_, index) => ({
      coordinates: { latitude: 37.7 + index * 0.01, longitude: -122.4 + index * 0.01 },
      itemId: `item-${index}`,
    })),
  };
  let active = 0;
  let maximumActive = 0;
  const result = await calculateRouteConfiguration(
    config,
    null,
    async (request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return calculatedLeg(request, request.position === 3 ? null : 600);
    },
    3,
  );
  assert.equal(maximumActive, 3);
  assert.equal(result.totalDurationSeconds, null);

  const previous = structuredClone(result.legs);
  await assert.rejects(
    calculateRouteConfiguration(
      { ...config, legModes: ["walk", "walk", "bike", "walk", "walk"] },
      {
        calculatedLegs: result.legs,
        computed_at: "2026-08-02T00:00:00.000Z",
        config_signature: result.configSignature,
        plan_id: "plan",
        provider_schema_version: "routes-v1",
        total_distance_meters: result.totalDistanceMeters,
        total_duration_seconds: result.totalDurationSeconds,
      },
      async () => {
        throw new RouteProviderError("quota");
      },
    ),
    (error) => error instanceof RouteProviderError && error.code === "quota",
  );
  assert.deepEqual(result.legs, previous);
});

test("transport suggestions are restrained and never use unknown-to-Train normalization", () => {
  const item = (mode: string): ItineraryItem =>
    ({ details: { mode }, id: mode, type: "transport" }) as unknown as ItineraryItem;
  assert.equal(suggestedDraftLegMode([item("bus")]), "bus");
  assert.equal(suggestedDraftLegMode([item("bus"), item("train")]), "walk");
  assert.equal(suggestedDraftLegMode([item("unknown")]), "walk");
  assert.equal(suggestedDraftLegMode([]), "walk");
});

test("Overview transport defaults use the restricted priority and distance threshold", () => {
  const city = (
    dayNumber: number,
    id: string,
    latitude: number,
    longitude: number,
    modes: string[] = [],
  ): PlannerDay =>
    ({
      day_number: dayNumber,
      id: `day-${dayNumber}`,
      items: [
        {
          id: `city-${id}`,
          place: {
            formattedAddress: id,
            id: `place-${id}`,
            latitude,
            longitude,
          },
          sort_order: 0,
          title: id,
          type: "location",
        },
        ...modes.map((mode, index) => ({
          details: { mode },
          id: `${id}-${mode}-${index}`,
          sort_order: index + 1,
          title: mode,
          type: "transport" as const,
        })),
      ],
    }) as unknown as PlannerDay;

  assert.deepEqual(overviewRouteModes, ["self_driving", "flight", "train", "bus", "bike"]);
  assert.equal(overviewFlightThresholdMeters, 500_000);

  const priorityDays = [
    city(1, "Origin", 37.7749, -122.4194),
    city(2, "Priority", 37.8044, -122.2712, ["bike", "bus", "train", "self_driving", "flight"]),
    city(3, "Transit priority", 37.8715, -122.273, ["bike", "bus", "train"]),
  ];
  assert.deepEqual(deriveOverviewDefaultModes(priorityDays, deriveOverviewStages(priorityDays)), [
    "flight",
    "train",
  ]);

  const distanceDays = [
    city(1, "San Francisco", 37.7749, -122.4194),
    city(2, "Oakland", 37.8044, -122.2712),
    city(3, "Los Angeles", 34.0522, -118.2437),
  ];
  assert.deepEqual(deriveOverviewDefaultModes(distanceDays, deriveOverviewStages(distanceDays)), [
    "self_driving",
    "flight",
  ]);

  const unknownDays = [
    city(1, "Unknown origin", 37.7749, -122.4194),
    city(2, "Unknown destination", 37.8044, -122.2712, ["ferry", "other"]),
  ];
  assert.deepEqual(deriveOverviewDefaultModes(unknownDays, deriveOverviewStages(unknownDays)), [
    "self_driving",
  ]);
});

test("route mode mapping is explicit and unknown modes never become Transit", () => {
  const expected = {
    bike: "BICYCLE",
    bus: "TRANSIT",
    cable_car: null,
    ferry: null,
    flight: null,
    motorcycle: null,
    other: null,
    rideshare: "DRIVE",
    self_driving: "DRIVE",
    shuttle: "TRANSIT",
    subway: "TRANSIT",
    taxi: "DRIVE",
    train: "TRANSIT",
    tram: "TRANSIT",
    walk: "WALK",
  } as const;
  for (const mode of routeLegModes) assert.equal(googleTravelMode(mode), expected[mode]);
  assert.equal(googleTravelMode("unknown"), null);
});

test("route geometry utilities use Haversine distance and decode Google polylines", () => {
  assert.ok(
    Math.abs(
      haversineDistanceMeters(
        { latitude: 36.12, longitude: -86.67 },
        { latitude: 33.94, longitude: -118.4 },
      ) - 2_885_104,
    ) < 2_000,
  );
  assert.deepEqual(decodeEncodedPolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), [
    { latitude: 38.5, longitude: -120.2 },
    { latitude: 40.7, longitude: -120.95 },
    { latitude: 43.252, longitude: -126.453 },
  ]);
  assert.throws(() => decodeEncodedPolyline("~"), /invalid/);
});

test("Google route provider sends one narrow primary-route request per leg", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const fetchImplementation = (async (url: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(url);
    requestInit = init;
    return googleResponse();
  }) as typeof fetch;
  const result = await createGoogleRoutesProvider({
    apiKey: "server-secret",
    fetchImplementation,
    now: () => "2026-08-02T00:00:00.000Z",
  }).calculateLeg(providerLeg("self_driving"));

  assert.equal(requestUrl, googleRoutesEndpoint);
  assert.equal(requestInit?.method, "POST");
  assert.equal(new Headers(requestInit?.headers).get("X-Goog-FieldMask"), googleRoutesFieldMask);
  assert.equal(new Headers(requestInit?.headers).get("X-Goog-Api-Key"), "server-secret");
  const body = JSON.parse(String(requestInit?.body));
  assert.deepEqual(body.origin.location.latLng, providerLeg().origin);
  assert.deepEqual(body.destination.location.latLng, providerLeg().destination);
  assert.equal(body.travelMode, "DRIVE");
  assert.equal(body.routingPreference, "TRAFFIC_UNAWARE");
  assert.equal(body.computeAlternativeRoutes, false);
  assert.equal("intermediates" in body, false);
  assert.equal("optimizeWaypointOrder" in body, false);
  assert.equal("departureTime" in body, false);
  assert.equal(result.geometry.source, "google");
  assert.equal(result.durationSeconds, 901);
  assert.equal(result.distanceMeters, 12_345);
});

test("unsupported route modes use straight fallback without fetch or invented duration", async () => {
  let fetchCount = 0;
  const provider = createGoogleRoutesProvider({
    apiKey: "",
    fetchImplementation: (async () => {
      fetchCount += 1;
      return googleResponse();
    }) as typeof fetch,
    now: () => "2026-08-02T00:00:00.000Z",
  });
  for (const mode of ["flight", "ferry", "cable_car", "motorcycle", "other"] as const) {
    const result = await provider.calculateLeg(providerLeg(mode));
    assert.equal(result.geometry.source, "straight");
    assert.equal(result.durationSeconds, null);
    assert.equal(result.fallbackReason, "unsupported_mode");
  }
  assert.equal(fetchCount, 0);
  assert.equal(straightFallbackLeg(providerLeg("flight"), "unsupported_mode").providerMode, null);
});

test("no-route falls back while Transit omits schedule fields and carries estimate metadata", async () => {
  const noRoute = await createGoogleRoutesProvider({
    apiKey: "key",
    fetchImplementation: (async () =>
      new Response(JSON.stringify({ routes: [] }), { status: 200 })) as typeof fetch,
  }).calculateLeg(providerLeg("walk"));
  assert.equal(noRoute.geometry.source, "straight");
  assert.equal(noRoute.fallbackReason, "no_route");
  assert.equal(noRoute.durationSeconds, null);
  assert.ok(noRoute.warnings.some(({ code }) => code === "walking_safety"));

  let transitBody: Record<string, unknown> = {};
  const transit = await createGoogleRoutesProvider({
    apiKey: "key",
    fetchImplementation: (async (_url, init) => {
      transitBody = JSON.parse(String(init?.body));
      return googleResponse();
    }) as typeof fetch,
  }).calculateLeg(providerLeg("subway"));
  assert.equal(transit.estimateKind, "transit_current_service");
  assert.equal("routingPreference" in transitBody, false);
  assert.equal("departureTime" in transitBody, false);
  assert.equal("arrivalTime" in transitBody, false);
});

test("provider errors are actionable, safe, and never silently become fallback", async () => {
  for (const [status, code] of [
    [400, "invalid_request"],
    [401, "authentication"],
    [403, "permission"],
    [404, "invalid_response"],
    [429, "quota"],
    [504, "timeout"],
    [500, "provider_unavailable"],
  ] as const) {
    const provider = createGoogleRoutesProvider({
      apiKey: "server-secret",
      fetchImplementation: (async () =>
        new Response("sensitive provider body", { status })) as typeof fetch,
    });
    await assert.rejects(provider.calculateLeg(providerLeg()), (error) => {
      assert.ok(error instanceof RouteProviderError);
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, /server-secret|sensitive provider body/);
      return true;
    });
  }

  await assert.rejects(
    createGoogleRoutesProvider({ apiKey: "" }).calculateLeg(providerLeg()),
    (error) => error instanceof RouteProviderError && error.code === "missing_key",
  );
  await assert.rejects(
    createGoogleRoutesProvider({
      apiKey: "key",
      fetchImplementation: (async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }) as typeof fetch,
    }).calculateLeg(providerLeg()),
    (error) => error instanceof RouteProviderError && error.code === "timeout",
  );
  await assert.rejects(
    createGoogleRoutesProvider({
      apiKey: "key",
      fetchImplementation: (async () => {
        throw new TypeError("fetch failed", {
          cause: new Error("connect ETIMEDOUT routes.googleapis.com"),
        });
      }) as typeof fetch,
    }).calculateLeg(providerLeg()),
    (error) => {
      assert.ok(error instanceof RouteProviderError);
      assert.equal(error.code, "network");
      assert.doesNotMatch(error.message, /ETIMEDOUT|routes\.googleapis\.com/);
      return true;
    },
  );
  assert.equal(parseGoogleDurationSeconds("1.6s"), 2);
  assert.throws(() => parseGoogleDurationSeconds("soon"), RouteProviderError);
});

test("route configuration accepts only eligible same-day places and synchronized modes", () => {
  assert.equal(validateDayRouteDraft(routeDraft()), null);
  for (const type of ["location", "transport", "car_rental", "note", "flight", "train"]) {
    assert.match(
      validateDayRouteDraft(
        routeDraft({
          stops: [
            routeStop("00000000-0000-4000-8000-000000000010", type, 37.7749, -122.4194),
            routeStop("00000000-0000-4000-8000-000000000011", "meal", 37.7849, -122.4094),
          ],
        }),
      ) ?? "",
      /Activity, Meal, and Hotel/,
    );
  }
  assert.match(
    validateDayRouteDraft(routeDraft({ legModes: [] })) ?? "",
    /mode count must equal stop count minus one/i,
  );
  assert.match(
    validateDayRouteDraft(
      routeDraft({ stops: [routeStop("missing", "activity", 37.7749, -122.4194)] }),
    ) ?? "",
    /between 2 and 20/,
  );
  assert.match(
    validateDayRouteDraft(
      routeDraft({
        stops: [
          { ...routeStop("same", "activity", 37.7749, -122.4194), coordinates: null },
          routeStop("other", "meal", 37.7849, -122.4094),
        ],
      }),
    ) ?? "",
    /saved map place/,
  );
  assert.equal(routeLegModes.length, 15);
});

test("route configuration permits only one Hotel repeated first and final", () => {
  const hotel = routeStop("hotel", "hotel", 37.7749, -122.4194);
  const meal = routeStop("meal", "meal", 37.7849, -122.4094);
  assert.equal(
    validateDayRouteDraft(routeDraft({ legModes: ["walk", "taxi"], stops: [hotel, meal, hotel] })),
    null,
  );
  assert.match(
    validateDayRouteDraft(routeDraft({ legModes: ["walk"], stops: [meal, meal] })) ?? "",
    /repeated Hotel/,
  );
  assert.match(
    validateDayRouteDraft(
      routeDraft({ legModes: ["walk", "walk"], stops: [meal, hotel, hotel] }),
    ) ?? "",
    /first and final/,
  );
  assert.match(
    validateDayRouteDraft(routeDraft({ stops: [hotel, hotel] })) ?? "",
    /two distinct coordinate/,
  );
});

test("route configuration permits only the previous day Hotel as the first stop", () => {
  const previousDayId = ids.targetDay;
  const previousHotel = {
    ...routeStop("previous-hotel", "hotel", 37.7749, -122.4194),
    dayId: previousDayId,
  };
  const todayHotel = routeStop("today-hotel", "hotel", 37.7849, -122.4094);
  assert.equal(
    validateDayRouteDraft(routeDraft({ previousDayId, stops: [previousHotel, todayHotel] })),
    null,
  );
  assert.match(
    validateDayRouteDraft(routeDraft({ stops: [previousHotel, todayHotel] })) ?? "",
    /first stop may be the previous day Hotel/,
  );
  assert.match(
    validateDayRouteDraft(routeDraft({ previousDayId, stops: [todayHotel, previousHotel] })) ?? "",
    /first stop may be the previous day Hotel/,
  );
  assert.match(
    validateDayRouteDraft(
      routeDraft({
        previousDayId,
        stops: [{ ...previousHotel, type: "activity" }, todayHotel],
      }),
    ) ?? "",
    /first stop may be the previous day Hotel/,
  );
});

test("previous day Hotel is projected only when it is a planned start", () => {
  const previousDay = {
    day_number: 1,
    id: ids.targetDay,
    items: [
      {
        id: "previous-hotel",
        place: {
          displayName: "Previous Hotel",
          id: "previous-hotel-place",
          latitude: 39,
          longitude: -71,
        },
        sort_order: 0,
        title: "Previous Hotel",
        type: "hotel",
      },
    ],
  } as unknown as PlannerDay;
  const today = {
    day_number: 2,
    id: ids.day,
    items: [],
  } as unknown as PlannerDay;
  assert.equal(buildDayRouteMarkers(today, [], previousDay).length, 0);
  const [marker] = buildDayRouteMarkers(today, ["previous-hotel"], previousDay);
  assert.equal(marker.entries[0].dayLabel, "Day 1");
  assert.equal(marker.label, "1");
});

test("route and cell-clear hardening migration keeps narrow atomic contracts", async () => {
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260803183257_allow_previous_day_hotel_route_start.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /create or replace function public\.save_day_route_plan/);
  assert.match(migration, /previous_day\.day_number = day\.day_number - 1/);
  assert.match(migration, /submitted\.position = 1[\s\S]*item\.type = 'hotel'/);
  assert.match(migration, /create function public\.clear_route_variant_items/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /trip\.owner_id = current_user_id/);
  assert.match(migration, /item\.id = any\(target_item_ids\)/);
  assert.match(
    migration,
    /revoke all on function public\.clear_route_variant_items[\s\S]*from public, anon/,
  );
  assert.match(
    migration,
    /grant execute on function public\.clear_route_variant_items[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(migration, /grant execute[^;]+to anon/);
});

test("manual route migration enforces normalized ownership and cascade contracts", async () => {
  const migration = await readFile(
    new URL(
      "../../../supabase/migrations/20260802130101_add_manual_day_route_plans.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const hardening = await readFile(
    new URL(
      "../../../supabase/migrations/20260802130920_harden_manual_day_route_plans.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const databaseTypes = await readFile(new URL("../../types/database.ts", import.meta.url), "utf8");
  const copyMigration = await readFile(
    new URL(
      "../../../supabase/migrations/20260729220000_flexible_itinerary_workflow.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const table of [
    "day_route_plans",
    "day_route_stops",
    "day_route_legs",
    "day_route_calculations",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(migration, new RegExp(`grant select on table public\\.${table} to authenticated`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon`));
    assert.match(databaseTypes, new RegExp(`${table}: \\{`));
  }

  assert.match(migration, /references public\.trip_days \(id, variant_id\) on delete cascade/);
  assert.match(
    migration,
    /item_id uuid not null references public\.itinerary_items \(id\) on delete cascade/,
  );
  assert.doesNotMatch(migration, /unique \(plan_id, item_id\)/);
  assert.match(migration, /security definer[\s\S]*set search_path = ''/);
  assert.match(migration, /not between 2 and 20/);
  assert.match(migration, /item\.type not in \('activity', 'meal', 'hotel'\)/);
  assert.match(migration, /Only one Hotel may repeat, exactly at the first and final positions/);
  assert.match(migration, /count\(distinct \(place\.latitude, place\.longitude\)\)/);
  assert.match(migration, /mode_count <> submitted_count - 1/);
  assert.match(migration, /and variant\.is_primary/);
  assert.match(hardening, /from anon/);
  assert.doesNotMatch(copyMigration, /day_route_plans|day_route_stops|day_route_legs/);

  for (const mode of routeLegModes) {
    assert.match(migration, new RegExp(`'${mode}'`));
  }
});

test("create accepts missing, start-only, and end-only time", () => {
  assert.equal(createItineraryItemSchema.safeParse(base).success, true);
  assert.equal(createItineraryItemSchema.safeParse({ ...base, startTime: "09:30" }).success, true);
  assert.equal(createItineraryItemSchema.safeParse({ ...base, endTime: "11:00" }).success, true);
  assert.deepEqual(normalizedTimes("", undefined), { start_time: null, end_time: null });
});

test("URL-capable items accept multiple labeled links", () => {
  const links = [
    { label: "Booking", url: "https://example.com/reservation" },
    { label: "Menu", url: "https://example.com/menu" },
  ];
  assert.equal(createItineraryItemSchema.safeParse({ ...base, links }).success, true);
  assert.equal(
    createItineraryItemSchema.safeParse({ ...base, links: [{ label: "", url: "bad" }] }).success,
    false,
  );
});

test("map marker dates merge consecutive day intervals", () => {
  assert.equal(
    mergeMarkerDateRanges([
      { dayLabel: "Feb 10", dayNumber: 1 },
      { dayLabel: "Feb 12", dayNumber: 3 },
      { dayLabel: "Feb 13", dayNumber: 4 },
      { dayLabel: "Feb 14", dayNumber: 5 },
      { dayLabel: "Feb 16", dayNumber: 7 },
      { dayLabel: "Feb 17", dayNumber: 8 },
    ]),
    "Feb 10, Feb 12–14, Feb 16–17",
  );
  assert.equal(
    mergeMarkerDateRanges([
      { dayLabel: "Day 2", dayNumber: 2 },
      { dayLabel: "Day 3", dayNumber: 3 },
    ]),
    "Day 2–3",
  );
});

test("overview keeps every City occurrence and gives same-day stages the first date label", () => {
  const city = (id: string, placeId: string, sortOrder: number, title: string) =>
    ({
      id,
      place: {
        formattedAddress: `${title} address`,
        id: placeId,
        latitude: sortOrder + 10,
        longitude: sortOrder + 20,
      },
      sort_order: sortOrder,
      title,
      type: "location",
    }) as unknown as ItineraryItem;
  const activity = {
    ...city("activity", "museum", 0, "Museum"),
    type: "activity",
  } as unknown as ItineraryItem;
  const days = [
    { day_number: 3, id: "day-3", items: [city("berlin-3", "berlin", 0, "Berlin")] },
    { day_number: 2, id: "day-2", items: [activity] },
    {
      date: "2026-08-02",
      day_number: 1,
      id: "day-1",
      items: [
        city("paris-2", "paris", 2, "Paris stay"),
        city("paris-1", "paris", 1, "Paris arrival"),
        city("london", "london", 3, "London"),
      ],
    },
    { day_number: 4, id: "day-4", items: [city("paris-4", "paris", 0, "Paris return")] },
  ] as unknown as PlannerDay[];

  const stages = deriveOverviewStages(days);
  assert.deepEqual(
    stages.map(({ dayRangeLabel, firstDayLabel, entries, placeId, position }) => ({
      firstDayLabel,
      dayRangeLabel,
      itemIds: entries.map(({ itemId }) => itemId),
      placeId,
      position,
    })),
    [
      {
        dayRangeLabel: "Aug 2",
        firstDayLabel: "Aug 2",
        itemIds: ["paris-1"],
        placeId: "paris",
        position: 1,
      },
      {
        dayRangeLabel: "Aug 2",
        firstDayLabel: "Aug 2",
        itemIds: ["paris-2"],
        placeId: "paris",
        position: 2,
      },
      {
        dayRangeLabel: "Aug 2",
        firstDayLabel: "Aug 2",
        itemIds: ["london"],
        placeId: "london",
        position: 3,
      },
      {
        dayRangeLabel: "Day 3",
        firstDayLabel: "Day 3",
        itemIds: ["berlin-3"],
        placeId: "berlin",
        position: 4,
      },
      {
        dayRangeLabel: "Day 4",
        firstDayLabel: "Day 4",
        itemIds: ["paris-4"],
        placeId: "paris",
        position: 5,
      },
    ],
  );
  assert.deepEqual(
    stages.slice(0, 3).map(({ firstDayLabel }) => firstDayLabel),
    ["Aug 2", "Aug 2", "Aug 2"],
  );
  assert.equal(neighboringCityConflict(orderedCityOccurrences(days))?.to.itemId, "paris-2");
});

test("overview allows the same City across days and omits the no-travel stay boundary", () => {
  const days = [
    {
      day_number: 1,
      items: [
        {
          id: "rome-1",
          place: { id: "rome", latitude: 41.9, longitude: 12.5 },
          sort_order: 0,
          title: "Rome",
          type: "location",
        },
      ],
    },
    { day_number: 2, items: [] },
    {
      day_number: 3,
      items: [
        {
          id: "rome-3",
          place: { id: "rome", latitude: 41.9, longitude: 12.5 },
          sort_order: 0,
          title: "Rome",
          type: "location",
        },
      ],
    },
  ] as unknown as PlannerDay[];
  const stages = deriveOverviewStages(days);
  assert.deepEqual(
    stages.map(({ dayRangeLabel }) => dayRangeLabel),
    ["Day 1", "Day 3"],
  );
  assert.deepEqual(
    stages.map(({ entries }) => entries[0].itemId),
    ["rome-1", "rome-3"],
  );
  assert.equal(neighboringCityConflict(orderedCityOccurrences(days)), null);
  assert.equal(isOverviewRouteLeg(stages[0], stages[1]), false);
  assert.deepEqual(buildOverviewRouteLines(stages, []), []);
});

test("overview keeps real legs around a repeated cross-day City boundary", () => {
  const days = [
    {
      day_number: 1,
      id: "day-1",
      items: [
        {
          id: "city-a",
          place: { id: "place-a", latitude: 1, longitude: 1 },
          sort_order: 0,
          title: "A",
          type: "location",
        },
        {
          id: "city-b-1",
          place: { id: "place-b", latitude: 2, longitude: 2 },
          sort_order: 1,
          title: "B",
          type: "location",
        },
      ],
    },
    {
      day_number: 2,
      id: "day-2",
      items: [
        {
          id: "city-b-2",
          place: { id: "place-b", latitude: 2, longitude: 2 },
          sort_order: 0,
          title: "B",
          type: "location",
        },
        {
          id: "city-c",
          place: { id: "place-c", latitude: 3, longitude: 3 },
          sort_order: 1,
          title: "C",
          type: "location",
        },
      ],
    },
  ] as unknown as PlannerDay[];
  const stages = deriveOverviewStages(days);
  assert.equal(neighboringCityConflict(orderedCityOccurrences(days)), null);
  assert.deepEqual(
    buildOverviewRouteLines(stages, []).map(({ position }) => position),
    [1, 3],
  );
  assert.deepEqual(deriveOverviewDefaultModes(days, stages), [
    "self_driving",
    undefined,
    "self_driving",
  ]);
});

test("neighboring City validation rejects only adjacent identical places", () => {
  const days = [
    {
      day_number: 1,
      id: "day-1",
      items: [
        {
          id: "city-a",
          place: { id: "place-a", latitude: 1, longitude: 1 },
          sort_order: 0,
          title: "A",
          type: "location",
        },
        {
          id: "city-b",
          place: { id: "place-b", latitude: 2, longitude: 2 },
          sort_order: 1,
          title: "B",
          type: "location",
        },
      ],
    },
  ] as unknown as PlannerDay[];
  assert.equal(
    prospectiveNeighboringCityConflict(days, [
      {
        dayId: "day-1",
        itemId: "new-a",
        placeKey: "place:place-a",
        sortOrder: 2,
        title: "A again",
      },
    ]),
    null,
  );
  assert.ok(
    prospectiveNeighboringCityConflict(days, [
      {
        dayId: "day-1",
        itemId: "new-b",
        placeKey: "place:place-b",
        sortOrder: 2,
        title: "B again",
      },
    ]),
  );
  assert.equal(
    prospectiveNeighboringCityConflict(
      [...days, { day_number: 2, id: "day-2", items: [] } as unknown as PlannerDay],
      [
        {
          dayId: "day-2",
          itemId: "next-day-b",
          placeKey: "place:place-b",
          sortOrder: 0,
          title: "B next day",
        },
      ],
    ),
    null,
  );
  const withReturn = structuredClone(days) as PlannerDay[];
  withReturn[0].items.push({
    ...withReturn[0].items[0],
    id: "city-a-return",
    sort_order: 2,
  });
  assert.ok(neighboringCityConflictAfterRemoving(withReturn, ["city-b"]));
});

test("Overview starts with straight previews and replaces only calculated City legs", () => {
  const stages = deriveOverviewStages([
    {
      day_number: 1,
      items: [
        {
          id: "city-a",
          place: { id: "place-a", latitude: 38.5, longitude: -120.2 },
          sort_order: 0,
          title: "City A",
          type: "location",
        },
      ],
    },
    {
      day_number: 2,
      items: [
        {
          id: "city-b",
          place: { id: "place-b", latitude: 40.7, longitude: -120.95 },
          sort_order: 0,
          title: "City B",
          type: "location",
        },
      ],
    },
  ] as unknown as PlannerDay[]);

  const [preview] = buildOverviewRouteLines(stages, []);
  assert.equal(preview.dashed, true);
  assert.deepEqual(preview.path, [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
  ]);

  const [calculated] = buildOverviewRouteLines(stages, [
    {
      computedAt: "2026-08-02T00:00:00.000Z",
      distanceMeters: 1_000,
      durationSeconds: 600,
      geometry: { encodedPolyline: "_p~iF~ps|U_ulLnnqC", source: "google" },
      legSignature: "overview-leg",
      mode: "walk",
      position: 1,
      providerMode: "WALK",
      warnings: [],
    },
  ]);
  assert.equal(calculated.dashed, false);
  assert.deepEqual(calculated.path, [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
  ]);
});

test("Day map City layer shows same-day City transfers separately from route stops", () => {
  const day = {
    date: "2026-08-02",
    day_number: 1,
    id: "day-1",
    items: [
      {
        id: "city-a",
        place: { id: "place-a", latitude: 38.5, longitude: -120.2 },
        sort_order: 0,
        title: "City A",
        type: "location",
      },
      {
        id: "city-b",
        place: { id: "place-b", latitude: 40.7, longitude: -120.95 },
        sort_order: 1,
        title: "City B",
        type: "location",
      },
      {
        id: "activity",
        place: { id: "activity-place", latitude: 39, longitude: -121 },
        sort_order: 2,
        title: "Museum",
        type: "activity",
      },
    ],
  } as unknown as PlannerDay;
  const stages = deriveOverviewStages([day]);
  const cityMarkers = buildDayCityMarkers(day, stages);
  assert.equal(cityMarkers.length, 2);
  assert.deepEqual(
    cityMarkers.map(({ appearance, label }) => ({ appearance, label })),
    [
      { appearance: "day-city", label: "Aug 2" },
      { appearance: "day-city", label: "Aug 2" },
    ],
  );
  const [cityLine] = buildDayCityRouteLines(day, stages, []);
  assert.equal(cityLine.color, "#2563eb");
  assert.equal(cityLine.dashed, true);
  assert.equal(cityLine.routeLayer, "city");
  assert.equal(buildDayRouteMarkers(day, []).length, 1);
});

test("Day route markers include only eligible places and combine repeated Hotel positions", () => {
  const item = (id: string, type: string, placeId: string | null, sortOrder: number) =>
    ({
      id,
      place: placeId
        ? {
            displayName: id,
            id: placeId,
            latitude: 40 + sortOrder,
            longitude: -70 - sortOrder,
          }
        : null,
      sort_order: sortOrder,
      title: id,
      type,
    }) as unknown as ItineraryItem;
  const day = {
    day_number: 2,
    id: ids.day,
    items: [
      item("city", "location", "city-place", 0),
      item("hotel", "hotel", "hotel-place", 1),
      item("activity", "activity", "activity-place", 2),
      item("meal-no-place", "meal", null, 3),
      item("transport", "transport", "transport-place", 4),
    ],
  } as unknown as PlannerDay;

  assert.deepEqual(
    eligibleDayRouteItems(day).map(({ id }) => id),
    ["hotel", "activity"],
  );
  const markers = buildDayRouteMarkers(day, ["hotel", "activity", "hotel"]);
  assert.equal(markers.length, 2);
  assert.equal(markers.find(({ itemIds }) => itemIds.includes("hotel"))?.label, "1 · 3");
  assert.equal(
    markers.find(({ itemIds }) => itemIds.includes("activity"))?.appearance,
    "route-planned",
  );
});

test("Day route renders Google legs solid and straight fallbacks dashed", () => {
  const calculation = {
    calculatedLegs: [
      {
        geometry: { encodedPolyline: "_p~iF~ps|U_ulLnnqC", source: "google" },
        legSignature: "google-leg",
        position: 1,
      },
      {
        geometry: {
          destination: { latitude: 38, longitude: -121 },
          origin: { latitude: 37, longitude: -122 },
          source: "straight",
        },
        legSignature: "straight-leg",
        position: 2,
      },
    ],
  } as unknown as DayRouteCalculation;
  const lines = buildDayRouteLines(calculation);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].dashed, false);
  assert.equal(lines[1].dashed, true);
  assert.deepEqual(lines[1].path, [
    { lat: 37, lng: -122 },
    { lat: 38, lng: -121 },
  ]);
});

test("route status ignores display changes and detects coordinate, deletion, and place changes", () => {
  const item = (id: string, latitude: number, longitude: number) =>
    ({
      day_id: ids.day,
      id,
      place: { displayName: id, id: `${id}-place`, latitude, longitude },
      start_time: "09:00:00",
      title: id,
      trip_id: ids.trip,
      type: id === "hotel" ? "hotel" : "activity",
      variant_id: ids.variant,
    }) as unknown as ItineraryItem;
  const workspace = {
    days: [
      {
        day_number: 1,
        id: ids.day,
        items: [item("hotel", 37.7, -122.4), item("museum", 37.8, -122.3)],
      },
    ],
    routePlans: [],
    variant: { id: ids.variant, is_primary: true, trip_id: ids.trip },
  } as unknown as PlannerWorkspace;
  const now = "2026-08-02T00:00:00.000Z";
  const plan: DayRoutePlan = {
    calculation: null,
    created_at: now,
    day_id: ids.day,
    id: "plan",
    legs: [
      {
        created_at: now,
        from_stop_id: "stop-1",
        id: "leg-1",
        mode: "walk",
        plan_id: "plan",
        position: 1,
        to_stop_id: "stop-2",
        updated_at: now,
      },
    ],
    stops: [
      {
        created_at: now,
        id: "stop-1",
        item_id: "hotel",
        plan_id: "plan",
        position: 1,
        updated_at: now,
      },
      {
        created_at: now,
        id: "stop-2",
        item_id: "museum",
        plan_id: "plan",
        position: 2,
        updated_at: now,
      },
    ],
    trip_id: ids.trip,
    updated_at: now,
    variant_id: ids.variant,
  };
  workspace.routePlans = [plan];
  const resolved = resolveRouteCalculationConfig(workspace, plan);
  assert.ok(resolved.config);
  plan.calculation = {
    calculatedLegs: [],
    computed_at: now,
    config_signature: buildRouteConfigSignature(resolved.config),
    plan_id: plan.id,
    provider_schema_version: "routes-v1",
    total_distance_meters: 0,
    total_duration_seconds: 0,
  };
  assert.equal(dayRouteStatus(workspace, plan), "current");

  workspace.days[0].items[0].title = "Renamed hotel";
  workspace.days[0].items[0].start_time = "14:00:00";
  assert.equal(dayRouteStatus(workspace, plan), "current");
  workspace.days[0].items[0].place!.latitude = 37.71;
  assert.equal(dayRouteStatus(workspace, plan), "stale");
  workspace.days[0].items[0].place = null;
  assert.equal(dayRouteStatus(workspace, plan), "needs_edit");
  workspace.days[0].items = workspace.days[0].items.filter(({ id }) => id !== "hotel");
  assert.equal(dayRouteStatus(workspace, plan), "needs_edit");
});

test("Overview routing is explicit and map interactions stay synchronized", async () => {
  const overview = await readFile(new URL("../routes/overview.ts", import.meta.url), "utf8");
  const overviewHook = await readFile(
    new URL("../routes/use-overview-route.ts", import.meta.url),
    "utf8",
  );
  const overviewUi = await readFile(
    new URL("../routes/overview-route-overlay.tsx", import.meta.url),
    "utf8",
  );
  const actions = await readFile(new URL("../routes/actions.ts", import.meta.url), "utf8");
  const itemActions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  const itemValidation = await readFile(
    new URL("./item-action-validation.ts", import.meta.url),
    "utf8",
  );
  const dayActions = await readFile(new URL("./day-actions.ts", import.meta.url), "utf8");
  const mapHook = await readFile(new URL("./hooks/use-planner-map.ts", import.meta.url), "utf8");
  const interactions = await readFile(
    new URL("./hooks/use-planner-interactions.ts", import.meta.url),
    "utf8",
  );
  let mapShell = await readFile(
    new URL("./components/planner-map-shell.tsx", import.meta.url),
    "utf8",
  );
  mapShell += await readFile(
    new URL("./components/planner-map-controls.tsx", import.meta.url),
    "utf8",
  );
  mapShell += await readFile(
    new URL("./components/planner-map-selected-place.tsx", import.meta.url),
    "utf8",
  );
  let routeUi = await readFile(new URL("../routes/day-route-overlay.tsx", import.meta.url), "utf8");
  routeUi += await readFile(new URL("../routes/day-route-editor.tsx", import.meta.url), "utf8");
  routeUi += await readFile(new URL("../routes/route-icon-button.tsx", import.meta.url), "utf8");
  let canvas = await readFile(new URL("../maps/planner-map-canvas.tsx", import.meta.url), "utf8");
  canvas += await readFile(new URL("../maps/planner-map-marker.tsx", import.meta.url), "utf8");
  canvas += await readFile(new URL("../maps/planner-map-line.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(overview, /fetch\(|computeRoutes|calculateGoogleRouteLeg/);
  assert.match(mapHook, /useState<PlannerMapMode>\("overview"\)/);
  assert.doesNotMatch(mapHook, /calculateDayRoute|routes\.googleapis/);
  assert.match(overviewUi, /Not set · preview line/);
  assert.match(overviewUi, /overviewRouteModes\.map/);
  assert.match(overviewUi, /!hasPendingCalculation/);
  assert.match(overviewUi, /Calculate route/);
  assert.match(overviewUi, /hasPendingCalculation \? "default" : "outline"/);
  assert.match(overviewUi, /Route details/);
  assert.match(overviewUi, /Set up route/);
  assert.match(overviewUi, /\? "Done"/);
  assert.match(overviewUi, /!route\.editing \? \(/);
  assert.match(overviewUi, /Close Overview panel/);
  assert.doesNotMatch(overviewUi, /Overview route leg times/);
  assert.match(overviewUi, /Duration unavailable/);
  assert.match(overviewHook, /mode && !calculatedLeg/);
  assert.match(overviewHook, /isOverviewRouteLeg/);
  assert.match(actions, /calculateOverviewRoute/);
  assert.match(actions, /mapWithConcurrency\(tasks, 3\)/);
  assert.match(actions, /isOverviewRouteLeg/);
  assert.match(actions, /is_trip_owner/);
  assert.match(mapHook, /day-route:\$\{variantId\}:\$\{dayRoute\.activeDay\?\.id/);
  assert.match(mapHook, /firstCity/);
  assert.match(interactions, /hasDayRoute\(day\.id\) \? "day_route" : "overview"/);
  assert.match(interactions, /routeExists \? "day_route" : "overview"/);
  assert.match(interactions, /setMapMode\("overview"\)/);
  assert.match(mapShell, /Map scope/);
  assert.match(mapShell, /Whole trip/);
  assert.match(mapShell, /This day/);
  assert.match(mapShell, /Day map content/);
  assert.match(mapShell, /All items/);
  assert.match(mapShell, /closeOverviewPanel[\s\S]*onMapSelectionClear/);
  assert.match(mapShell, /closeDayPanel[\s\S]*onMapSelectionClear/);
  assert.match(mapShell, /PanelBottomOpen/);
  assert.match(mapShell, /Open Overview panel/);
  assert.match(mapShell, /Open day route panel/);
  assert.match(mapShell, /title="Edit item"/);
  assert.doesNotMatch(mapShell, /Show Route A panel/);
  assert.match(mapShell, /DayRouteOverlay[\s\S]*onClose=\{closeDayPanel\}/);
  assert.doesNotMatch(mapShell, /day-route-place-card/);
  assert.match(routeUi, /Discard changes and collapse route editor/);
  assert.match(routeUi, /Discard changes and return to route summary/);
  assert.match(routeUi, /onBack=\{route\.cancelEditing\}/);
  assert.match(routeUi, /Close route panel/);
  assert.match(routeUi, /route\.openEdit/);
  assert.match(routeUi, /label="Edit route"[\s\S]*variant="secondary"/);
  assert.match(routeUi, /label="Create route"[\s\S]*variant="primary"/);
  assert.match(routeUi, /primary: "bg-primary text-primary-foreground/);
  assert.match(routeUi, /secondary: "border bg-background text-foreground/);
  assert.match(routeUi, /destructive: "text-destructive hover:bg-destructive\/10"/);
  assert.match(routeUi, /useState\(true\)/);
  assert.match(routeUi, /aria-expanded=\{unplannedOpen\}/);
  assert.match(routeUi, /Add \$\{item\.title\} to route/);
  assert.doesNotMatch(routeUi, /View route|requestFit/);
  assert.match(routeUi, /Manual order is used/);
  assert.match(routeUi, /Save & calculate/);
  assert.doesNotMatch(
    routeUi,
    /[">]Route [BC][<"]|alternative route|schedule selector|time order/i,
  );
  assert.doesNotMatch(routeUi, /drag(handle)?|draggable/i);
  assert.doesNotMatch(canvas, /draggable|editable/);
  assert.match(canvas, /day-city/);
  assert.match(canvas, /#2563eb/);
  assert.match(itemActions + itemValidation, /prospectiveNeighboringCityConflict/);
  assert.match(dayActions, /prospectiveNeighboringCityConflict/);
  assert.match(actions, /neighboringOverviewCityConflict/);
});

test("Routes server key stays in the server-only provider and out of client modules", async () => {
  const serverProvider = await readFile(
    new URL("../../lib/providers/routes/google-routes.server.ts", import.meta.url),
    "utf8",
  );
  const packageJson = JSON.parse(
    await readFile(new URL("../../../package.json", import.meta.url), "utf8"),
  ) as { scripts?: Record<string, string> };
  const clientSources = await Promise.all(
    [
      "../routes/day-route-overlay.tsx",
      "../routes/use-day-route.ts",
      "../routes/overview-route-overlay.tsx",
      "../routes/use-overview-route.ts",
      "./hooks/use-planner-map.ts",
      "./components/planner-map-shell.tsx",
      "../maps/planner-map-canvas.tsx",
      "../maps/planner-map-line.tsx",
      "../maps/planner-map-marker.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.match(serverProvider, /import "server-only"/);
  assert.match(serverProvider, /process\.env\.GOOGLE_ROUTES_API_KEY/);
  assert.doesNotMatch(clientSources.join("\n"), /GOOGLE_ROUTES_API_KEY|process\.env/);
  assert.match(packageJson.scripts?.dev ?? "", /node --use-env-proxy/);
  assert.match(packageJson.scripts?.start ?? "", /node --use-env-proxy/);
});

test("edit and delete inputs validate", () => {
  assert.equal(
    updateItineraryItemSchema.safeParse({
      id: ids.item,
      tripId: ids.trip,
      title: "Edited",
      type: "activity",
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    updateItineraryItemSchema.safeParse({
      endTime: "",
      id: ids.item,
      startTime: "",
      tripId: ids.trip,
      type: "activity",
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    deleteItineraryItemSchema.safeParse({ id: ids.item, tripId: ids.trip, variantId: ids.variant })
      .success,
    true,
  );
  assert.equal(
    clearItineraryItemsSchema.safeParse({
      itemIds: [ids.item],
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    clearItineraryItemsSchema.safeParse({
      itemIds: [ids.item, ids.item],
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    false,
  );
});

test("car rental details restrict action while address and provider remain optional", () => {
  assert.equal(carRentalDetailsSchema.safeParse({ action: "pickup" }).success, true);
  assert.equal(
    carRentalDetailsSchema.safeParse({ action: "return", address: "BER", provider: "Sixt" })
      .success,
    true,
  );
  assert.equal(
    carRentalDetailsSchema.safeParse({ action: "dropoff", address: "BER" }).success,
    false,
  );
});

test("reorder payload persists explicit unique sort orders", () => {
  const parsed = reorderItineraryItemsSchema.parse({
    dayId: ids.day,
    items: [{ id: ids.item, sortOrder: 1 }],
    tripId: ids.trip,
    variantId: ids.variant,
  });
  assert.deepEqual(parsed.items, [{ id: ids.item, sortOrder: 1 }]);
  assert.equal(
    reorderItineraryItemsSchema.safeParse({
      dayId: ids.day,
      items: [
        { id: ids.item, sortOrder: 0 },
        { id: ids.item, sortOrder: 1 },
      ],
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    false,
  );
});

test("day insertion and removal inputs stay scoped to a trip and variant", () => {
  assert.equal(
    insertTripDaySchema.safeParse({
      beforeDayNumber: 2,
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
  assert.equal(
    insertTripDaySchema.safeParse({
      beforeDayNumber: 0,
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    false,
  );
  assert.equal(
    removeTripDaySchema.safeParse({
      dayId: ids.day,
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
});

test("copies get new IDs, destination ordering, and independent values", () => {
  const source = {
    booking_url: "https://example.com",
    created_at: "2026-01-01",
    day_id: ids.day,
    details: { confirmed: true },
    end_time: null,
    id: ids.item,
    notes: "Original",
    place_id: null,
    schedule_kind: "none",
    schedule_text: null,
    sort_order: 2,
    start_time: null,
    title: "Museum",
    trip_id: ids.trip,
    type: "activity",
    updated_at: "2026-01-01",
    variant_id: ids.variant,
  } satisfies ItineraryItem;
  const [copy] = buildCopyRows(
    [source],
    ids.targetDay,
    7,
    true,
    () => "00000000-0000-4000-8000-000000000006",
  );
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.day_id, ids.targetDay);
  assert.equal(copy.sort_order, 7);
  copy.title = "Independent edit";
  assert.equal(source.title, "Museum");
  assert.equal(
    copyItineraryItemsSchema.safeParse({
      sourceItemIds: [ids.item],
      targetDayId: ids.targetDay,
      tripId: ids.trip,
      variantId: ids.variant,
    }).success,
    true,
  );
});

test("RLS remains the write authority and server actions do not use a service role", async () => {
  const migration = await readFile(
    new URL("../../../supabase/migrations/20260729160000_initial_schema.sql", import.meta.url),
    "utf8",
  );
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  assert.match(migration, /itinerary_items_(insert|update|delete)_owners/);
  assert.match(migration, /public\.is_trip_owner\(trip_id\)/);
  assert.doesNotMatch(actions, /service[_-]?role/i);
});

test("schedule metadata follows nullable start and end times", async () => {
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  assert.equal(scheduleKind(null, null), "none");
  assert.equal(scheduleKind("09:00", null), "exact");
  assert.equal(scheduleKind(null, "10:00"), "exact");
  assert.equal(scheduleKind("09:00", "10:00"), "range");
  assert.match(actions, /schedule_kind: scheduleKind/);
  assert.match(actions, /values\.schedule_kind = scheduleKind/);
});

test("keyboard navigation wraps rows and clamps to the grid", () => {
  assert.deepEqual(moveGridFocus({ row: 0, column: 0 }, "ArrowRight", 3, 4), { row: 0, column: 1 });
  assert.deepEqual(moveGridFocus({ row: 0, column: 3 }, "Tab", 3, 4), { row: 1, column: 0 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 0 }, "Tab", 3, 4, true), { row: 0, column: 3 });
  assert.deepEqual(moveGridFocus({ row: 0, column: 0 }, "ArrowUp", 3, 4), { row: 0, column: 0 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 1 }, "ArrowDown", 3, 4), { row: 2, column: 1 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 1 }, "ArrowLeft", 3, 4), { row: 1, column: 0 });
});

test("selection extension and fill targets use normalized bounds", () => {
  const anchor = { row: 3, column: 4 };
  const end = { row: 1, column: 2 };
  assert.deepEqual(selectionBounds(anchor, end), { top: 1, bottom: 3, left: 2, right: 4 });
  assert.equal(selectionContains(anchor, end, { row: 2, column: 3 }), true);
  assert.equal(selectionContains(anchor, end, { row: 0, column: 3 }), false);
  assert.deepEqual(fillTargetRows(anchor, end), [2, 3]);
});

test("planner clipboard copy and paste preserves typed item IDs", () => {
  const payload = {
    cells: [{ columnOffset: 0, items: [ids.item], rowOffset: 0 }],
    kind: "trip-planner/items" as const,
    sourceColumn: 2,
    version: 2 as const,
  };
  assert.deepEqual(parsePlannerClipboard(encodePlannerClipboard(payload)), payload);
});

test("malformed and unrelated clipboard input is rejected safely", () => {
  assert.equal(parsePlannerClipboard("not json"), null);
  assert.equal(
    parsePlannerClipboard(JSON.stringify({ kind: "other", version: 1, cells: [] })),
    null,
  );
  assert.equal(
    parsePlannerClipboard(
      JSON.stringify({
        kind: "trip-planner/items",
        version: 1,
        cells: [{ rowOffset: -1, columnOffset: 0, items: [ids.item] }],
      }),
    ),
    null,
  );
});

test("spreadsheet UI uses stable lightweight reorder controls plus rollback hooks", async () => {
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-grid-elements.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-item-row.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-layout-elements.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./components/planner-sheets.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-matrix.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-matrix.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-toolbar.tsx", import.meta.url), "utf8");
  for (const file of [
    "./components/planner-matrix.tsx",
    "./components/planner-toolbar.tsx",
    "./components/planner-workspace-event-boundary.tsx",
    "./hooks/use-planner-clipboard.ts",
    "./hooks/use-planner-interactions.ts",
    "./hooks/use-planner-mutations.ts",
  ])
    workspace += await readFile(new URL(file, import.meta.url), "utf8");
  let form = await readFile(new URL("./components/planner-item-form.tsx", import.meta.url), "utf8");
  form += await readFile(
    new URL("./components/planner-item-primary-fields.tsx", import.meta.url),
    "utf8",
  );
  form += await readFile(
    new URL("./components/planner-item-secondary-fields.tsx", import.meta.url),
    "utf8",
  );
  const mapShell = await readFile(
    new URL("./components/planner-map-shell.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  const queries = await readItineraryQueryModules();
  assert.match(workspace, />\s*Move up /);
  assert.match(workspace, />\s*Move down /);
  assert.match(workspace, /event\.altKey && event\.key === "ArrowUp"/);
  assert.match(workspace, /event\.altKey && event\.key === "ArrowDown"/);
  assert.match(workspace, /aria-label="Fill selected cells down"/);
  assert.match(workspace, /Only this column will\s*change/);
  assert.match(workspace, /requestAnimationFrame/);
  assert.match(workspace, /replacedItems/);
  assert.match(workspace, /replaceCategoryItems/);
  assert.match(workspace, /sourceItemIds:\s*sourceDay\.items\s*\.filter/);
  assert.match(workspace, /startRangeSelection/);
  assert.match(
    workspace,
    /initialPlannerSelection\([\s\S]*initialWorkspace\.days\.length[\s\S]*id === "city"/,
  );
  assert.match(workspace, /useState<GridCoordinate>\(\(\) => initialSelection\)/);
  assert.match(workspace, /window\.addEventListener\("pointermove", move\)/);
  assert.match(workspace, /onDoubleClick=\{openEditorFromDoubleClick\}/);
  assert.match(workspace, /data-edit-item=\{item\.id\}/);
  assert.match(workspace, /interactive=\{selected\}/);
  assert.match(workspace, /pointer-events-none/);
  assert.match(workspace, /M12 3V9M9 6H15/);
  assert.match(workspace, /M12 15V21M9 18H15/);
  assert.match(workspace, />Add day before</);
  assert.match(workspace, />Add day after</);
  assert.match(workspace, /insertIcon\("up"\)/);
  assert.match(workspace, /insertIcon\("down"\)/);
  assert.match(workspace, /min-w-max select-none/);
  assert.match(workspace, /location="mobilebar"/);
  assert.match(workspace, /selectedCount === 1 && !activeCellAtCapacity/);
  assert.match(workspace, /const active =\s*selectedCount === 1/);
  assert.match(workspace, /lastSelected &&\s*selectionAnchor\.row === selectionEnd\.row/);
  assert.match(workspace, /selectedDayRow/);
  assert.match(workspace, />Edit item</);
  assert.match(workspace, />\s*Delete item\s*</);
  assert.match(workspace, /text-destructive focus:text-destructive/);
  assert.match(workspace, /window\.innerWidth < 1200/);
  assert.match(workspace, /data-add-item/);
  assert.match(workspace, /Insert day above/);
  assert.match(workspace, /Insert day below/);
  assert.match(workspace, /Remove Day/);
  assert.match(styles, /aria-selected="true"[\s\S]*data-add-item/);
  assert.match(styles, /aria-selected="true"[\s\S]*display: flex/);
  assert.match(workspace, /Copy selected cells[\s\S]*Paste/);
  assert.doesNotMatch(workspace, />Fill down</);
  assert.doesNotMatch(workspace, />Duplicate /);
  assert.match(workspace, /setSelectionAnchor\(\{ column: -1, row: -1 \}\)/);
  assert.match(styles, /data-fill-dragging="true"[\s\S]*filter: blur/);
  assert.match(styles, /min-width: 900px[\s\S]*max-width: 1199px/);
  assert.match(styles, /minmax\(0, 56fr\) 4px minmax\(380px, 44fr\)/);
  assert.match(styles, /max-width: 899px[\s\S]*grid-template-rows: minmax\(0, 1fr\)/);
  assert.match(styles, /planner-editor-sheet[\s\S]*max-height: 92dvh/);
  assert.match(styles, /aria-label="Fill selected cells down"[\s\S]*display: none/);
  assert.match(workspace, /h-14[\s\S]*xl:h-\[72px\]/);
  assert.match(workspace, /planner-mobile-map-fab/);
  assert.match(workspace, /open=\{mapExpanded\}/);
  assert.match(mapShell, /PlannerMapCanvas/);
  assert.match(workspace, /Promise\.all\(\s*replacements\.flatMap/);
  assert.match(workspace, /replacedIds/);
  assert.doesNotMatch(workspace, /DndContext|useSortable|DndDescribedBy/);
  assert.doesNotMatch(workspace, /@\/components\/ui\/popover/);
  assert.match(workspace, /internalClipboard/);
  assert.match(workspace, /destination\.column !== payload\.sourceColumn/);
  assert.match(workspace, /cells selected across one row only/);
  assert.match(form, /<form/);
  assert.match(form, /type="submit"/);
  assert.match(form, /event\.key === "Escape"/);
  assert.match(form, /Clear start time/);
  assert.match(form, /Clear end time/);
  assert.match(form, /requestAnimationFrame\(\(\) => titleRef\.current\?\.focus\(\)\)/);
  assert.match(queries, /useCopyItineraryItems[\s\S]*onMutate/);
  assert.match(queries, /onError:[\s\S]*context\?\.previous/);
});

test("mobile workspace keeps the matrix editable and uses safe overlay sheets", async () => {
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-layout-elements.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./components/planner-toolbar.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./hooks/use-planner-mutations.ts", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-sheets.tsx", import.meta.url), "utf8");
  workspace += await readFile(new URL("./components/planner-matrix.tsx", import.meta.url), "utf8");
  const secondaryFields = await readFile(
    new URL("./components/planner-item-secondary-fields.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  const tripsLayout = await readFile(
    new URL("../../app/trips/layout.tsx", import.meta.url),
    "utf8",
  );
  assert.match(styles, /max-width: 639px/);
  assert.match(styles, /safe-area-inset-left/);
  assert.match(styles, /planner-editor-sheet input,[\s\S]*font-size: 16px/);
  assert.match(styles, /planner-map-sheet[\s\S]*height: calc\(100dvh/);
  assert.match(styles, /planner-matrix[\s\S]*touch-action: pan-x pan-y/);
  assert.match(styles, /planner-matrix[\s\S]*overscroll-behavior: none/);
  assert.match(styles, /planner-mobile-map-fab[\s\S]*display: inline-flex/);
  assert.match(
    styles,
    /\.map-panel-reopen \{\s*bottom: max\(2\.75rem, calc\(env\(safe-area-inset-bottom\)/,
  );
  assert.match(workspace, /selectedMapItem/);
  assert.match(workspace, /selectedId=\{selectedMapItem\?\.id\}/);
  assert.match(workspace, /planner-map-sheet/);
  assert.match(workspace, /Tap a date to select a day/);
  assert.match(workspace, /format\(parseISO\(selectedDay\.date\), "MMM d"\)/);
  assert.doesNotMatch(workspace, /mobile-selected-day-bar/);
  assert.match(tripsLayout, /trips-global-header sticky top-0 z-\[80\]/);
  assert.match(workspace, /planner-toolbar sticky top-0 z-\[70\]/);
  assert.match(styles, /min-width: 900px[\s\S]*planner-workspace[\s\S]*padding: 0 16px;/);
  assert.match(styles, /max-width: 899px[\s\S]*planner-workspace[\s\S]*padding: 0 8px;/);
  assert.match(tripsLayout, /h-14[\s\S]*sm:h-16/);
  assert.doesNotMatch(styles, /trips-shell:has\(\.trip-planner-page\)[\s\S]*display: none/);
  assert.match(secondaryFields, /grid min-w-0 gap-3 sm:grid-cols-2/);
  assert.match(
    workspace,
    /Copy selected cells[\s\S]*Paste[\s\S]*Copy to days[\s\S]*Copy previous day/,
  );
});

test("planner exposes Phase 2 empty, refresh-error, save, and recovery states", async () => {
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(
    new URL("./components/planner-layout-elements.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./components/planner-toolbar.tsx", import.meta.url), "utf8");
  workspace += await readFile(
    new URL("./components/planner-workspace-event-boundary.tsx", import.meta.url),
    "utf8",
  );
  workspace += await readFile(new URL("./hooks/use-planner-clipboard.ts", import.meta.url), "utf8");
  workspace += await readFile(new URL("./hooks/use-planner-mutations.ts", import.meta.url), "utf8");
  const queries = await readItineraryQueryModules();
  let actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  actions += await readFile(new URL("./action-helpers.ts", import.meta.url), "utf8");
  assert.match(workspace, /This itinerary is empty/);
  assert.match(workspace, /planner could not refresh/);
  assert.match(workspace, /Saving…[\s\S]*Saved/);
  assert.match(workspace, /Unsupported clipboard data/);
  assert.match(workspace, /previous order was restored/);
  assert.match(queries, /onError:[\s\S]*context\?\.previous/);
  assert.match(actions, /You do not have permission to change itinerary items/);
});
test("Google place normalization keeps only provider-neutral requested fields", () => {
  assert.deepEqual(
    normalizeGooglePlace({
      id: " ChIJ123 ",
      displayName: " Ferry Building ",
      formattedAddress: " 1 Ferry Building, San Francisco, CA ",
      location: { lat: () => 37.7955, lng: () => -122.3937 },
    }),
    {
      provider: "google",
      providerPlaceId: "ChIJ123",
      displayName: "Ferry Building",
      formattedAddress: "1 Ferry Building, San Francisco, CA",
      latitude: 37.7955,
      longitude: -122.3937,
    },
  );
});

test("place snapshot deduplication uses provider identity", () => {
  const place = normalizeGooglePlace({
    id: "same",
    displayName: "Original",
    location: { lat: 1, lng: 2 },
  });
  assert.equal(deduplicatePlaceSnapshots([place, { ...place, displayName: "Updated" }]).length, 1);
});

test("Google place normalization rejects invalid coordinates", () => {
  assert.throws(
    () => normalizeGooglePlace({ id: "bad", displayName: "Bad", location: { lat: 91, lng: 0 } }),
    /invalid coordinates/,
  );
});

test("city items require a Google place while the displayed name remains optional", () => {
  const city = { ...base, details: {}, title: "Paris", type: "location" as const };
  assert.equal(createItineraryItemSchema.safeParse(city).success, false);
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...city,
      placeSnapshot: {
        displayName: "Paris",
        formattedAddress: "Paris, France",
        latitude: 48.8566,
        longitude: 2.3522,
        provider: "google",
        providerPlaceId: "paris-place-id",
      },
    }).success,
    true,
  );
});

test("hotel permits a displayed name without an exact place and transport has no location", () => {
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...base,
      details: {},
      title: "Private apartment",
      type: "hotel",
    }).success,
    true,
  );
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...base,
      details: { location: "Old transport location", mode: "train" },
      title: "Train",
      type: "transport",
    }).success,
    false,
  );
  assert.equal(
    createItineraryItemSchema.safeParse({
      ...base,
      details: { mode: "train" },
      title: "Train",
      type: "transport",
    }).success,
    true,
  );
});

test("address and location controls use normalized map places", async () => {
  let form = await readFile(new URL("./components/planner-item-form.tsx", import.meta.url), "utf8");
  form += await readFile(
    new URL("./components/planner-item-primary-fields.tsx", import.meta.url),
    "utf8",
  );
  assert.match(form, /const placeLabel/);
  assert.match(form, /\? "Address"/);
  assert.match(form, /: "Location"/);
  assert.match(form, /<PlaceAutocomplete/);
  assert.doesNotMatch(form, /item-location-/);
  assert.match(form, /const placeText = place\?\.formattedAddress \?\? place\?\.displayName/);
});

test("Phase 3 keeps exact item and marker selection synchronized", async () => {
  let workspace = await readFile(
    new URL("./components/planner-workspace.tsx", import.meta.url),
    "utf8",
  );
  let map = await readFile(new URL("../maps/planner-map-canvas.tsx", import.meta.url), "utf8");
  map += await readFile(new URL("../maps/planner-map-marker.tsx", import.meta.url), "utf8");
  let mapShell = await readFile(
    new URL("./components/planner-map-shell.tsx", import.meta.url),
    "utf8",
  );
  mapShell += await readFile(
    new URL("./components/planner-map-controls.tsx", import.meta.url),
    "utf8",
  );
  mapShell += await readFile(
    new URL("./components/planner-map-selected-place.tsx", import.meta.url),
    "utf8",
  );
  workspace += mapShell;
  workspace += await readFile(new URL("./hooks/use-planner-map.ts", import.meta.url), "utf8");
  workspace += await readFile(new URL("../routes/day-route-map.ts", import.meta.url), "utf8");
  const places = await readFile(
    new URL("../places/place-autocomplete.tsx", import.meta.url),
    "utf8",
  );
  assert.match(workspace, /selectedItemId/);
  assert.match(workspace, /setSelectedItemId\(item\.id\)/);
  assert.match(mapShell, /entry\.dayLabel/);
  assert.doesNotMatch(workspace, /Map preview · P3|P4/);
  assert.match(map, /AdvancedMarker/);
  assert.match(map, /entry\.title/);
  assert.match(places, /PlaceAutocompleteElement/);
  assert.match(places, /gmp-select/);
  assert.match(places, /placeFields/);
  assert.match(workspace, /kind:/);
  assert.match(map, /markerStyles/);
  assert.match(map, /const glyph =/);
  assert.match(map, /glyph=\{glyph\}/);
  assert.match(workspace, /const key = item\.place!\.id/);
  assert.match(workspace, /existing\.entries\.push\(entry\)/);
  assert.match(mapShell, /aria-label="Map scope"/);
  assert.match(mapShell, /mergeMarkerDateRanges\(marker\.entries\)/);
  assert.match(map, /itemIds\.includes\(selectedId\)/);
});

test("replace-copy clears constrained destination rows before inserting preserved places", async () => {
  const workspace = await readFile(
    new URL("./hooks/use-planner-clipboard.ts", import.meta.url),
    "utf8",
  );
  const queries = await readItineraryQueryModules();
  const deletePosition = workspace.indexOf("deleteMutation.mutateAsync");
  const copyPosition = workspace.indexOf("copyMutation.mutateAsync", deletePosition);
  assert.ok(deletePosition >= 0 && copyPosition > deletePosition);
  assert.match(queries, /place_id === item\.place_id/);
  assert.match(queries, /source\?\.place/);
});
