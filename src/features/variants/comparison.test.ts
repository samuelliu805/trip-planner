import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  attachVariantComparisonDayRoutes,
  normalizeVariantComparisonProjection,
  reconcileComparisonVisibility,
  reconcileVariantComparisonProjections,
} from "./comparison-normalization.ts";
import {
  deriveComparisonStages,
  deriveVariantComparisonPresentation,
  formatCitySequence,
  visibleComparisonPresentations,
} from "./comparison-presentation.ts";
import type {
  ComparisonCityRow,
  ComparisonDayRow,
  ComparisonVariantRow,
  VariantComparisonCity,
  VariantComparisonDay,
  VariantComparisonProjection,
} from "./comparison-types.ts";

const comparisonVariants: ComparisonVariantRow[] = [
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

const comparisonDays: ComparisonDayRow[] = [
  { date: "2026-09-02", day_number: 2, id: "day-a-2", variant_id: "route-a" },
  { date: "2026-09-01", day_number: 1, id: "day-a-1", variant_id: "route-a" },
  { date: null, day_number: 1, id: "day-b-1", variant_id: "route-b" },
];

function comparisonCity(
  overrides: Partial<ComparisonCityRow> & Pick<ComparisonCityRow, "day_id" | "id" | "variant_id">,
): ComparisonCityRow {
  const { day_id, id, variant_id, ...rest } = overrides;
  return {
    day_id,
    id,
    place: {
      country_code: null,
      formatted_address: "Tokyo, Japan",
      google_place_id: `google-${id}`,
      id: `place-${id}`,
      latitude: 35.6762,
      locality_name: null,
      longitude: 139.6503,
    },
    place_id: `place-${id}`,
    sort_order: 0,
    title: "Tokyo",
    type: "location",
    variant_id,
    ...rest,
  };
}

function projectedCity(
  itemId: string,
  title: string,
  latitude: number,
  longitude: number,
  sortOrder = 0,
): VariantComparisonCity {
  return {
    itemId,
    latitude,
    longitude,
    placeId: `place-${title.toLowerCase()}`,
    placeKey: `google:${title.toLowerCase()}`,
    sortOrder,
    title,
  };
}

function comparisonDay(
  id: string,
  dayNumber: number,
  cities: VariantComparisonCity[],
  date: string | null = null,
): VariantComparisonDay {
  return { cities, date, dayNumber, id, route: { calculatedLegs: [], saved: false, stops: [] } };
}

function comparisonProjection(
  days: VariantComparisonProjection["days"],
  overrides: Partial<VariantComparisonProjection> = {},
): VariantComparisonProjection {
  return {
    color: "#166534",
    days,
    isPrimary: true,
    knownCost: [],
    name: "Route A",
    variantId: "route-a",
    ...overrides,
  };
}

test("variant comparison derives current destination localities with legacy fallback", async () => {
  const loader = await readFile(new URL("./comparison-data.ts", import.meta.url), "utf8");
  const schema = (
    await Promise.all(
      [
        "../../../supabase/migrations/20260729160000_initial_schema.sql",
        "../../../supabase/migrations/20260802130101_add_manual_day_route_plans.sql",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
  const normalized = normalizeVariantComparisonProjection(
    comparisonVariants,
    [
      ...comparisonDays,
      { date: null, day_number: 1, id: "outside-day", variant_id: "outside-route" },
    ],
    [
      comparisonCity({
        day_id: "day-a-1",
        id: "city-second",
        sort_order: 2,
        title: "Kyoto",
        variant_id: "route-a",
      }),
      comparisonCity({
        day_id: "day-a-1",
        id: "rental-osaka",
        place: {
          country_code: "JP",
          formatted_address: "Osaka, Japan",
          google_place_id: "google-rental-osaka",
          id: "place-rental-osaka",
          latitude: 34.6937,
          locality_name: "Osaka",
          longitude: 135.5023,
        },
        place_id: "place-rental-osaka",
        sort_order: 2,
        title: "Return car",
        type: "car_rental",
        variant_id: "route-a",
      }),
      comparisonCity({
        day_id: "day-a-1",
        id: "activity-first",
        place: {
          country_code: "JP",
          formatted_address: "Tokyo, Japan",
          google_place_id: "google-activity-first",
          id: "place-activity-first",
          latitude: 35.6762,
          locality_name: "Tokyo",
          longitude: 139.6503,
        },
        place_id: "place-activity-first",
        sort_order: 1,
        type: "activity",
        variant_id: "route-a",
      }),
      comparisonCity({
        day_id: "outside-day",
        id: "outside-city",
        variant_id: "outside-route",
      }),
      comparisonCity({
        day_id: "day-a-1",
        id: "mismatched-city",
        variant_id: "route-b",
      }),
    ],
  );

  assert.deepEqual(
    normalized.map(({ variantId }) => variantId),
    ["route-a", "route-b"],
  );
  assert.deepEqual(
    normalized[0].days.map(({ dayNumber }) => dayNumber),
    [1, 2],
  );
  assert.deepEqual(
    normalized[0].days[0].cities.map(({ itemId }) => itemId),
    ["activity-first", "rental-osaka"],
  );
  assert.equal(normalized[0].days[0].cities[0].latitude, 35.6762);
  assert.equal(normalized[0].days[0].cities[0].placeId, "place-activity-first");
  assert.equal(normalized[1].days[0].cities.length, 0, "variants without locality remain present");

  assert.match(loader, /\.from\("route_variants"\)[\s\S]*\.eq\("trip_id", tripId\)/);
  assert.match(loader, /\.from\("itinerary_items"\)[\s\S]*\.eq\("trip_id", tripId\)/);
  assert.match(loader, /\.in\("type", \[/);
  assert.match(
    loader,
    /place:places\(id, source, provider_place_id, google_place_id, formatted_address, latitude, longitude, locality_name, country_code\)/,
  );
  assert.match(loader, /\.in\("variant_id", variantIds\)/);
  assert.match(loader, /getRelationalDatabase\(\)/);
  assert.doesNotMatch(loader, /createClient\(\)|@\/lib\/supabase\/server/);
  assert.doesNotMatch(loader, /service[_-]?role|admin|createService/iu);
  assert.doesNotMatch(loader, /item_links|day_route_legs|provider_data/);
  assert.match(loader, /dayNumber === undefined/);
  assert.match(loader, /\.from\("day_route_plans"\)/);
  assert.match(loader, /\.from\("day_route_stops"\)/);
  assert.match(loader, /\.from\("day_route_calculations"\)/);
  assert.match(loader, /"car_rental"/);
  assert.doesNotMatch(loader, /"transport"|"flight"|"train"/);
  for (const policy of [
    "route_variants_select_members",
    "trip_days_select_members",
    "places_select_members",
    "itinerary_items_select_members",
    "day_route_plans_select_members",
    "day_route_stops_select_members",
    "day_route_calculations_select_members",
  ])
    assert.match(schema, new RegExp(`create policy "${policy}"[\\s\\S]*is_trip_member`));
});

test("variant comparison collapses adjacent locality stages but preserves later returns", () => {
  const projection = comparisonProjection([
    comparisonDay(
      "day-1",
      1,
      [projectedCity("tokyo", "Tokyo", 35.6762, 139.6503, 1)],
      "2026-09-01",
    ),
    comparisonDay(
      "day-2",
      2,
      [
        {
          ...projectedCity("kyoto", "Kyoto", 35.0116, 135.7681, 2),
          formattedAddress: "Kyoto, Japan",
        },
      ],
      "2026-09-02",
    ),
    comparisonDay(
      "day-3",
      3,
      [projectedCity("kyoto-stay", "Kyoto", 35.0116, 135.7681)],
      "2026-09-03",
    ),
    comparisonDay("day-4", 4, [projectedCity("tokyo-return", "Tokyo", 35.6762, 139.6503)]),
  ]);
  const stages = deriveComparisonStages(projection);
  const presentation = deriveVariantComparisonPresentation(projection, "route-a");

  assert.deepEqual(
    stages.map(({ entries }) => entries[0].title),
    ["Tokyo", "Kyoto", "Tokyo"],
  );
  assert.equal(stages.length, 3, "adjacent Kyoto Days collapse and the later Tokyo remains");
  assert.equal(stages[1].entries.length, 2);
  assert.equal(presentation.lines.length, 2);
  assert.equal(formatCitySequence(stages), "Tokyo → Kyoto → Tokyo");
  assert.equal(formatCitySequence([]), "No city/town stages");
  assert.ok(stages.every(({ id }) => id.startsWith("comparison:route-a:stage:")));
  assert.ok(presentation.lines.every(({ id }) => id.startsWith("comparison:route-a:leg:")));
});

test("whole-trip comparison retains intermediate Day locality clusters and the Hotel return", () => {
  const city = (
    id: string,
    locality: string,
    latitude: number,
    longitude: number,
    sortOrder: number,
    type: "activity" | "hotel" | "meal",
  ) =>
    comparisonCity({
      day_id: "day-a-1",
      id,
      place: {
        country_code: "US",
        formatted_address: `${locality}, MA`,
        google_place_id: `google-${id}`,
        id: `place-${id}`,
        latitude,
        locality_name: locality,
        longitude,
      },
      place_id: `place-${id}`,
      sort_order: sortOrder,
      title: id,
      type,
      variant_id: "route-a",
    });
  const normalized = normalizeVariantComparisonProjection(comparisonVariants, comparisonDays, [
    city("breakfast", "Boston", 42.36, -71.06, 10, "meal"),
    city("mit", "Cambridge", 42.3601, -71.0942, 20, "activity"),
    city("dinner", "Boston", 42.351, -71.07, 30, "meal"),
    city("hotel", "Boston", 42.349, -71.078, 40, "hotel"),
  ]);
  const presentation = deriveVariantComparisonPresentation(normalized[0], "route-a");

  assert.deepEqual(
    normalized[0].days[0].cities.map(({ title }) => title),
    ["Boston", "Cambridge", "Boston"],
  );
  assert.deepEqual(
    presentation.stages.map(({ entries }) => entries[0].title),
    ["Boston", "Cambridge", "Boston"],
  );
  assert.equal(presentation.lines.length, 2);
});

test("comparison entered from Day Route scopes every variant to that Day route", () => {
  const projection = comparisonProjection([
    {
      ...comparisonDay("day-7", 7, []),
      route: {
        calculatedLegs: [],
        saved: false,
        stops: [
          {
            itemId: "breakfast",
            latitude: 42.36,
            longitude: -71.06,
            placeId: "place-breakfast",
            sortOrder: 10,
            title: "Breakfast",
            type: "meal",
          },
          {
            itemId: "museum",
            latitude: 42.34,
            longitude: -71.09,
            placeId: "place-museum",
            sortOrder: 20,
            title: "Museum",
            type: "activity",
          },
        ],
      },
    },
    comparisonDay("day-8", 8, [projectedCity("other-day", "Kyoto", 35, 135)]),
  ]);
  const presentation = deriveVariantComparisonPresentation(projection, "route-a", 7);

  assert.equal(presentation.stages.length, 0);
  assert.equal(presentation.markers.length, 2);
  assert.equal(presentation.lines.length, 1);
  assert.equal(presentation.lines[0].dashed, true);
  assert.equal(presentation.citySequence, "Breakfast → Museum");
  assert.ok(presentation.markers.every(({ summary }) => summary?.includes("Day 7 route stop")));
});

test("saved Day route comparison preserves stop occurrences and stored geometry", () => {
  const normalized = normalizeVariantComparisonProjection(comparisonVariants, comparisonDays, [
    comparisonCity({
      day_id: "day-a-1",
      id: "hotel",
      place: {
        country_code: "US",
        formatted_address: "Boston",
        google_place_id: "hotel-place",
        id: "hotel-place",
        latitude: 38.5,
        locality_name: "Boston",
        longitude: -120.2,
      },
      place_id: "hotel-place",
      title: "Hotel",
      type: "hotel",
      variant_id: "route-a",
    }),
  ]);
  const attached = attachVariantComparisonDayRoutes(
    normalized,
    [
      comparisonCity({
        day_id: "day-a-1",
        id: "hotel",
        place: {
          country_code: "US",
          formatted_address: "Boston",
          google_place_id: "hotel-place",
          id: "hotel-place",
          latitude: 38.5,
          locality_name: "Boston",
          longitude: -120.2,
        },
        place_id: "hotel-place",
        title: "Hotel",
        type: "hotel",
        variant_id: "route-a",
      }),
    ],
    [{ day_id: "day-a-1", id: "plan-a", variant_id: "route-a" }],
    [
      { item_id: "hotel", plan_id: "plan-a", position: 1 },
      { item_id: "hotel", plan_id: "plan-a", position: 2 },
    ],
    [
      {
        calculated_legs: [
          {
            computedAt: "2026-08-07T00:00:00.000Z",
            distanceMeters: 100,
            durationSeconds: 60,
            geometry: { encodedPolyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@", source: "google" },
            legSignature: "leg-a",
            mode: "walk",
            position: 1,
            providerMode: "WALK",
            warnings: [],
          },
        ],
        plan_id: "plan-a",
      },
    ],
  );
  const presentation = deriveVariantComparisonPresentation(attached[0], "route-a", 1);

  assert.equal(attached[0].days[0].route.saved, true);
  assert.equal(attached[0].days[0].route.stops.length, 2, "returning to one Hotel stays valid");
  assert.equal(presentation.markers.length, 1);
  assert.equal(presentation.markers[0].label, "1 · 2");
  assert.equal(presentation.lines.length, 1);
  assert.equal(presentation.lines[0].dashed, false);
});

test("Phase 5B comparison excludes invalid coordinates and applies provider-neutral emphasis", () => {
  const normalized = normalizeVariantComparisonProjection(comparisonVariants, comparisonDays, [
    comparisonCity({ day_id: "day-a-1", id: "valid", variant_id: "route-a" }),
    comparisonCity({
      day_id: "day-a-2",
      id: "invalid",
      place: {
        country_code: null,
        formatted_address: null,
        google_place_id: null,
        id: "place-invalid",
        latitude: 95,
        locality_name: null,
        longitude: 10,
      },
      place_id: "place-invalid",
      variant_id: "route-a",
    }),
  ]);
  assert.equal(normalized[0].days.flatMap(({ cities }) => cities).length, 1);

  const routeA = deriveVariantComparisonPresentation(
    comparisonProjection([
      comparisonDay("day", 1, [projectedCity("a", "A", 1, 1), projectedCity("b", "B", 2, 2, 1)]),
    ]),
    "route-a",
  );
  const routeB = deriveVariantComparisonPresentation(
    comparisonProjection([], {
      color: "#2563eb",
      isPrimary: false,
      name: "Route B",
      variantId: "route-b",
    }),
    "route-a",
  );
  const inactiveWithLine = deriveVariantComparisonPresentation(
    comparisonProjection(
      [
        comparisonDay("day-b", 1, [
          projectedCity("c", "C", 3, 3),
          projectedCity("d", "D", 4, 4, 1),
        ]),
      ],
      { color: "#2563eb", isPrimary: false, name: "Route B", variantId: "route-b" },
    ),
    "route-a",
  );

  assert.equal(routeA.lines[0].color, "#166534");
  assert.equal(routeA.lines[0].dashed, true);
  assert.equal(routeA.lines[0].geodesic, false);
  assert.equal(routeA.lines[0].path.length, 2);
  assert.ok(routeA.lines[0].strokeWeight! > inactiveWithLine.lines[0].strokeWeight!);
  assert.ok(routeA.lines[0].opacity! > inactiveWithLine.lines[0].opacity!);
  assert.ok(routeA.lines[0].zIndex! > inactiveWithLine.lines[0].zIndex!);
  assert.ok(routeA.markers.every(({ readOnly, selectable }) => readOnly && selectable === false));
  assert.match(routeA.markers[0].accessibleLabel!, /Route A.*locality stage 1.*read-only/);
  assert.deepEqual(
    visibleComparisonPresentations([routeA, routeB], new Set(), "route-a").map(
      ({ variantId }) => variantId,
    ),
    ["route-a"],
    "active route remains visible even if absent from local visibility state",
  );
});

test("Phase 5B comparison state reconciles renamed, recolored, created, and deleted variants", () => {
  const cached = normalizeVariantComparisonProjection(comparisonVariants, comparisonDays, []);
  const authoritative = reconcileVariantComparisonProjections(
    [{ ...comparisonVariants[0], color: "#ea580c", name: "Northern route" }, comparisonVariants[1]],
    cached,
  );
  assert.equal(authoritative[0].name, "Northern route");
  assert.equal(authoritative[0].color, "#ea580c");
  assert.equal(authoritative[0].days.length, 2, "cached structural days remain reusable");

  const reconciled = reconcileComparisonVisibility(
    ["route-a", "route-c"],
    "route-a",
    new Set(["route-b"]),
    new Set(["route-a", "route-b"]),
  );
  assert.deepEqual([...reconciled], ["route-a", "route-c"]);
});

test("Phase 5B UI keeps comparison read-only, responsive, isolated, and cost-free", async () => {
  const comparisonUi = (
    await Promise.all(
      [
        "./components/route-variant-comparison-panel.tsx",
        "./components/route-variant-comparison-sheet.tsx",
        "./components/variant-comparison-feedback.tsx",
        "./components/variant-comparison-mobile-bar.tsx",
        "./components/variant-comparison-rows.tsx",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
  const comparisonHook = await readFile(
    new URL("./use-variant-comparison.ts", import.meta.url),
    "utf8",
  );
  const comparisonDomain = (
    await Promise.all(
      [
        "./comparison-normalization.ts",
        "./comparison-presentation.ts",
        "./comparison-types.ts",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
  const controls = await readFile(
    new URL("../itinerary/components/planner-map-controls.tsx", import.meta.url),
    "utf8",
  );
  const mapShell = await readFile(
    new URL("../itinerary/components/planner-map-shell.tsx", import.meta.url),
    "utf8",
  );
  const variantControls = await readFile(
    new URL("./components/route-variant-controls.tsx", import.meta.url),
    "utf8",
  );
  const mapHook = await readFile(
    new URL("../itinerary/hooks/use-planner-map.ts", import.meta.url),
    "utf8",
  );
  const queries = (
    await Promise.all(
      ["../itinerary/item-mutations.ts", "../itinerary/day-mutations.ts"].map((path) =>
        readFile(new URL(path, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");

  assert.match(controls, /DropdownMenu[\s\S]*Compare whole trip[\s\S]*Compare Day \{day\}/);
  assert.match(
    mapShell,
    /onMapModeChange=\{\(mode, comparisonScope\) =>[\s\S]*onMapModeChange\(mode, comparisonScope\)/,
  );
  assert.match(comparisonHook, /variants\.length >= 2/);
  assert.match(comparisonHook, /Discard or save the open Day route draft/);
  assert.match(comparisonHook, /variantId === activeVariantId \|\|/);
  assert.doesNotMatch(comparisonUi, /Matrix:[\s\S]*Map: read only/);
  assert.match(comparisonUi, /Routes[\s\S]*comparison\.visiblePresentations\.length/);
  assert.doesNotMatch(comparisonUi, /Known Cost|Always visible/);
  assert.match(comparisonUi, /comparisonMoney/);
  assert.doesNotMatch(comparisonUi, /No priced items/);
  assert.match(comparisonUi, /flex min-w-0 items-center gap-2/);
  assert.match(comparisonUi, /min-h-11/);
  assert.match(comparisonUi, /min-\[900px\]:hidden/);
  assert.match(comparisonUi, /min-\[900px\]:flex/);
  assert.match(comparisonUi, /Close comparison panel/);
  assert.doesNotMatch(comparisonUi, />\s*Exit\s*</);
  assert.doesNotMatch(comparisonUi, /PullUpPanelHandle/);
  assert.doesNotMatch(comparisonHook, /previewVariantId|panelOpen/);
  assert.match(mapHook, /mapMode === "comparison"\s*\? comparisonMarkers/);
  assert.match(mapHook, /mapMode === "comparison"\s*\? comparisonLines/);
  assert.match(mapHook, /if \(mapMode === "comparison"\) return/);
  assert.match(mapHook, /current === "comparison" \? current : mode/);
  assert.match(mapHook, /returnMode === "day_route" \? dayRoute\.activeDay\?\.day_number/);
  assert.match(variantControls, /window\.location\.assign\([\s\S]*tripSectionHref/);
  assert.doesNotMatch(comparisonUi, /router\.push|variantHref/);
  assert.match(queries, /invalidateVariantComparison/);
  assert.doesNotMatch(
    comparisonDomain + comparisonHook + comparisonUi,
    /calculateOverviewRoute|calculateDayRoute|googleRoutesEndpoint|routes\.googleapis/,
  );
  assert.doesNotMatch(
    comparisonUi,
    /total distance|total duration|night count|score|recommendation/i,
  );
});
