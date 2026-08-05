import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
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
      formatted_address: "Tokyo, Japan",
      google_place_id: `google-${id}`,
      id: `place-${id}`,
      latitude: 35.6762,
      longitude: 139.6503,
    },
    place_id: `place-${id}`,
    sort_order: 0,
    title: "Tokyo",
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
  return { cities, date, dayNumber, id };
}

function comparisonProjection(
  days: VariantComparisonProjection["days"],
  overrides: Partial<VariantComparisonProjection> = {},
): VariantComparisonProjection {
  return {
    color: "#166534",
    days,
    isPrimary: true,
    name: "Route A",
    variantId: "route-a",
    ...overrides,
  };
}

test("Phase 5B projection is lightweight, City-only, trip-scoped, RLS-protected, and deterministic", async () => {
  const loader = await readFile(new URL("./comparison-data.ts", import.meta.url), "utf8");
  const schema = await readFile(
    new URL("../../../supabase/migrations/20260729160000_initial_schema.sql", import.meta.url),
    "utf8",
  );
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
        id: "city-first",
        sort_order: 1,
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
    ["city-first", "city-second"],
  );
  assert.equal(normalized[0].days[0].cities[0].latitude, 35.6762);
  assert.equal(normalized[0].days[0].cities[0].placeId, "place-city-first");
  assert.equal(normalized[1].days[0].cities.length, 0, "variants with no Cities remain present");

  assert.match(loader, /\.from\("route_variants"\)[\s\S]*\.eq\("trip_id", tripId\)/);
  assert.match(loader, /\.from\("itinerary_items"\)[\s\S]*\.eq\("trip_id", tripId\)/);
  assert.match(loader, /\.eq\("type", "location"\)/);
  assert.match(
    loader,
    /place:places\(id, google_place_id, formatted_address, latitude, longitude\)/,
  );
  assert.match(loader, /\.in\("variant_id", variantIds\)/);
  assert.match(loader, /createClient\(\)/);
  assert.doesNotMatch(loader, /service[_-]?role|admin|createService/iu);
  assert.doesNotMatch(
    loader,
    /item_links|day_route_plans|day_route_stops|day_route_legs|day_route_calculations|provider_data/,
  );
  for (const policy of [
    "route_variants_select_members",
    "trip_days_select_members",
    "places_select_members",
    "itinerary_items_select_members",
  ])
    assert.match(schema, new RegExp(`create policy "${policy}"[\\s\\S]*is_trip_member`));
});

test("Phase 5B comparison derivation preserves explicit City structure and stay boundaries", () => {
  const projection = comparisonProjection([
    comparisonDay(
      "day-1",
      1,
      [
        {
          ...projectedCity("kyoto", "Kyoto", 35.0116, 135.7681, 2),
          formattedAddress: "Kyoto, Japan",
        },
        projectedCity("tokyo", "Tokyo", 35.6762, 139.6503, 1),
      ],
      "2026-09-01",
    ),
    comparisonDay("day-2", 2, [], "2026-09-02"),
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
    ["Tokyo", "Kyoto", "Kyoto", "Tokyo"],
  );
  assert.equal(stages.length, 4, "multiple Cities and repeated later occurrences remain stages");
  assert.equal(presentation.lines.length, 2, "the cross-day Kyoto stay boundary adds no line");
  assert.equal(formatCitySequence(stages), "Tokyo → Kyoto → Tokyo");
  assert.equal(formatCitySequence([]), "No City stages");
  assert.ok(stages.every(({ id }) => id.startsWith("comparison:route-a:stage:")));
  assert.ok(presentation.lines.every(({ id }) => id.startsWith("comparison:route-a:leg:")));
});

test("Phase 5B comparison excludes invalid coordinates and applies provider-neutral emphasis", () => {
  const normalized = normalizeVariantComparisonProjection(comparisonVariants, comparisonDays, [
    comparisonCity({ day_id: "day-a-1", id: "valid", variant_id: "route-a" }),
    comparisonCity({
      day_id: "day-a-2",
      id: "invalid",
      place: {
        formatted_address: null,
        google_place_id: null,
        id: "place-invalid",
        latitude: 95,
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
  assert.match(routeA.markers[0].accessibleLabel!, /Route A.*City stage 1.*read-only/);
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
      [
        "../itinerary/queries.ts",
        "../itinerary/item-mutations.ts",
        "../itinerary/day-mutations.ts",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");

  assert.match(controls, /label: "Compare"/);
  assert.match(controls, /disabled: Boolean\(comparisonBlockingReason\)/);
  assert.match(comparisonHook, /variants\.length >= 2/);
  assert.match(comparisonHook, /Discard or save the open Day route draft/);
  assert.match(comparisonHook, /variantId === activeVariantId \|\|/);
  assert.match(comparisonUi, /Matrix: \{active\.name\} · Map: read only/);
  assert.match(comparisonUi, /Routes \{comparison\.visiblePresentations\.length\}\//);
  assert.match(comparisonUi, /Read only/);
  assert.match(comparisonUi, /min-h-11/);
  assert.match(comparisonUi, /min-\[900px\]:hidden/);
  assert.match(comparisonUi, /min-\[900px\]:block/);
  assert.doesNotMatch(
    comparisonUi,
    /Hide legend|Show comparison legend|Previewing|Return to active/,
  );
  assert.doesNotMatch(comparisonHook, /previewVariantId|panelOpen/);
  assert.match(mapHook, /mapMode === "comparison"\s*\? comparisonMarkers/);
  assert.match(mapHook, /mapMode === "comparison"\s*\? comparisonLines/);
  assert.match(mapHook, /if \(mapMode === "comparison"\) return/);
  assert.match(mapHook, /current === "comparison" \? current : mode/);
  assert.match(variantControls, /router\.push\(variantHref/);
  assert.doesNotMatch(comparisonUi, /router\.push|variantHref/);
  assert.match(queries, /invalidateVariantComparison/);
  assert.doesNotMatch(
    comparisonDomain + comparisonHook + comparisonUi,
    /calculateOverviewRoute|calculateDayRoute|googleRoutesEndpoint|routes\.googleapis|encodedPolyline/,
  );
  assert.doesNotMatch(
    comparisonUi,
    /total distance|total duration|night count|score|recommendation/i,
  );
});
