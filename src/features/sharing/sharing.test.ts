import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { matrixCategoryColumns } from "../itinerary/components/matrix-columns.ts";
import {
  actionLabel,
  orderedPublicItems,
  publicDayCitySequence,
  publicDayJourney,
  publicRentalItemLabel,
  publicTransferItemLabel,
  safeExternalUrl,
} from "./presentation.ts";
import {
  buildPublicOverviewLines,
  buildPublicRouteLines,
  publicDayRoutePlan,
  publicOverviewStops,
  publicRouteCandidates,
} from "./public-map-model.ts";
import {
  canonicalPublicViews,
  publicItinerarySchema,
  publicItinerarySettingsSchema,
  publicOverviewRouteCalculationInputSchema,
  publicRouteCalculationInputSchema,
  publicViewSchema,
} from "./schema.ts";
import type { PublicItinerary, PublicItineraryItem } from "./types.ts";

async function readAppStyles() {
  return (
    await Promise.all(
      [
        "../../app/globals.css",
        "../../app/planner-workspace.css",
        "../../app/public-workspace.css",
      ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
    )
  ).join("\n");
}

const ref = (character: string) => character.repeat(64);

const itinerary: PublicItinerary = publicItinerarySchema.parse({
  available: true,
  citySequence: [],
  days: [
    {
      city: "Kyoto",
      date: "2026-10-10",
      dayNumber: 1,
      items: [
        { ref: ref("a"), sortOrder: 30, title: "Late manual item", type: "meal" },
        {
          place: { displayName: "Museum", latitude: 35.011, longitude: 135.768 },
          ref: ref("b"),
          sortOrder: 10,
          title: "Museum",
          type: "activity",
        },
        { ref: ref("c"), sortOrder: 20, startTime: "09:15:00", title: "Train", type: "train" },
        { ref: ref("d"), sortOrder: 40, title: "Stay", type: "hotel" },
      ],
      ref: ref("e"),
    },
  ],
  metadata: { coverCities: ["Kyoto"], description: "One-day itinerary", title: "Kyoto · Route A" },
  savedRoutes: [],
  settings: {
    allowRouteExplore: true,
    defaultView: "overview",
    showAddresses: false,
    showMapRoutes: true,
    showNotes: false,
    showQuickActionLinks: true,
    showTimes: true,
  },
  trip: {
    dayCount: 1,
    endDate: "2026-10-10",
    startDate: "2026-10-10",
    timezone: "Asia/Tokyo",
    title: "Kyoto",
  },
  variant: { color: "#166b4f", name: "Route A" },
});

test("public views use Overview as the stable canonical default and decode only legacy Compact", () => {
  assert.deepEqual(canonicalPublicViews, ["overview", "table", "timeline"]);
  assert.equal(publicViewSchema.parse("compact"), "overview");
  assert.equal(publicViewSchema.parse("table"), "table");
  assert.equal(
    publicItinerarySettingsSchema.safeParse({
      allowRouteExplore: true,
      defaultView: "compact",
      shareDescription: "",
      shareTitle: "",
      showAddresses: false,
      showMapRoutes: true,
      showNotes: false,
      showQuickActionLinks: true,
      showTimes: true,
      variantId: "00000000-0000-4000-8000-000000000001",
    }).success,
    false,
  );
});

test("Overview preserves manual order and separates activities, transport, meals, and stays", () => {
  const day = itinerary.days[0];
  assert.deepEqual(
    orderedPublicItems(day).map(({ title }) => title),
    ["Museum", "Train", "Late manual item", "Stay"],
  );
  const journey = publicDayJourney(day);
  assert.deepEqual(
    journey.groups.flatMap(({ items }) => items).map(({ title }) => title),
    ["Museum", "Late manual item"],
  );
  assert.deepEqual(
    journey.groups.map(({ kind }) => kind),
    ["activity", "meal"],
  );
  assert.deepEqual(
    journey.transport.map(({ title }) => title),
    ["Train"],
  );
  assert.deepEqual(
    journey.stays.map(({ title }) => title),
    ["Stay"],
  );
  assert.equal(day.items.find(({ title }) => title === "Museum")?.startTime, undefined);
  assert.equal(day.items.find(({ title }) => title === "Train")?.startTime, "09:15:00");
});

test("day summaries preserve manual order through contiguous presentation groups", () => {
  const baseDay = itinerary.days[0];
  const journey = publicDayJourney({
    ...baseDay,
    items: [
      { ref: ref("q"), sortOrder: 10, title: "Museum", type: "activity" },
      { ref: ref("r"), sortOrder: 20, title: "Metro", type: "transport" },
      { ref: ref("s"), sortOrder: 30, title: "Lunch", type: "meal" },
      { ref: ref("t"), sortOrder: 40, title: "Train", type: "train" },
      { ref: ref("u"), sortOrder: 50, title: "Dinner", type: "meal" },
    ],
  });

  assert.deepEqual(
    journey.groups.map(({ kind, items }) => ({
      items: items.map(({ title }) => title),
      kind,
    })),
    [
      { items: ["Museum"], kind: "activity" },
      { items: ["Lunch", "Dinner"], kind: "meal" },
    ],
  );
  assert.deepEqual(
    journey.transport.map(({ title }) => title),
    ["Metro", "Train"],
  );
  assert.equal(
    journey.groups.flatMap(({ items }) => items).length,
    3,
    "transport is not counted as a destination Activity",
  );
});

test("Car rental stays support content in the public Transport row", () => {
  const car = {
    carRental: { action: "pickup" as const, company: "Hertz" },
    place: { displayName: "Milan Central" },
    ref: ref("v"),
    sortOrder: 25,
    title: "Hertz pickup",
    type: "car_rental" as const,
  };
  const journey = publicDayJourney({
    ...itinerary.days[0],
    items: [{ ref: ref("w"), sortOrder: 20, title: "Airport train", type: "train" }, car],
  });

  assert.deepEqual(car.carRental, { action: "pickup", company: "Hertz" });
  assert.deepEqual(
    journey.transport.map(({ title }) => title),
    ["Airport train", "Hertz pickup"],
  );
});

test("read-only travel text separates transfers from concise rental actions", () => {
  const rental = {
    carRental: { action: "pickup" as const, company: "Hertz" },
    place: { displayName: "Kansai Airport" },
    ref: ref("r"),
    sortOrder: 1,
    startTime: "08:30:00",
    title: "Pickup",
    type: "car_rental" as const,
  } satisfies PublicItineraryItem;
  assert.equal(publicRentalItemLabel(rental), "Rental car pickup: 08:30 · Hertz · Kansai Airport");
  assert.equal(
    publicRentalItemLabel({
      ...rental,
      carRental: { action: "pickup", company: "Kansai Airport" },
    }),
    "Rental car pickup: 08:30 · Kansai Airport",
  );
  assert.equal(
    publicTransferItemLabel({
      ref: ref("drive"),
      sortOrder: 2,
      startTime: "09:15:00",
      title: "Drive",
      type: "transport",
    }),
    "09:15 · Drive",
  );
});

test("public Days and Overview retain intermediate locality clusters", () => {
  const day = publicItinerarySchema.parse({
    ...itinerary,
    days: [
      {
        city: "Milan",
        date: "2026-10-10",
        dayNumber: 1,
        items: [
          {
            place: { displayName: "Milan", latitude: 45.4642, longitude: 9.19 },
            ref: ref("f"),
            sortOrder: 10,
            title: "Milan",
            type: "location",
          },
          {
            place: { displayName: "MILAN", latitude: 45.4642, longitude: 9.19 },
            ref: ref("p"),
            sortOrder: 15,
            title: "Milan",
            type: "location",
          },
          { ref: ref("g"), sortOrder: 20, title: "Duomo", type: "activity" },
          { ref: ref("h"), sortOrder: 30, title: "Train to Venice", type: "train" },
          {
            place: { displayName: "Venice", latitude: 45.4408, longitude: 12.3155 },
            ref: ref("i"),
            sortOrder: 40,
            title: "Venice",
            type: "location",
          },
          { ref: ref("j"), sortOrder: 50, title: "Cicchetti", type: "meal" },
          { ref: ref("k"), sortOrder: 60, title: "Canal hotel", type: "hotel" },
        ],
        ref: ref("l"),
      },
    ],
  }).days[0];

  const journey = publicDayJourney(day);
  assert.deepEqual(publicDayCitySequence(day), ["Milan", "Venice"]);
  assert.deepEqual(
    journey.groups.flatMap(({ items }) => items).map(({ title }) => title),
    ["Duomo", "Cicchetti"],
  );
  assert.deepEqual(
    journey.transport.map(({ title }) => title),
    ["Train to Venice"],
  );
  assert.deepEqual(
    journey.stays.map(({ title }) => title),
    ["Canal hotel"],
  );

  const overviewStops = publicOverviewStops({ ...itinerary, days: [day] });
  assert.deepEqual(
    overviewStops.map(({ title }) => title),
    ["Milan", "Venice"],
  );
  assert.equal(buildPublicOverviewLines({ ...itinerary, days: [day] }).length, 1);
});

test("public Overview clusters alternating localities and retains the final Hotel return", () => {
  const day = publicItinerarySchema.parse({
    ...itinerary,
    days: [
      {
        dayNumber: 1,
        items: [
          {
            place: {
              displayName: "Breakfast",
              latitude: 42.36,
              localityName: "Boston",
              longitude: -71.06,
            },
            ref: ref("q"),
            sortOrder: 0,
            title: "Breakfast",
            type: "meal",
          },
          {
            place: {
              displayName: "MIT",
              latitude: 42.36,
              localityName: "Cambridge",
              longitude: -71.09,
            },
            ref: ref("r"),
            sortOrder: 1,
            title: "MIT",
            type: "activity",
          },
          {
            place: {
              displayName: "Lunch",
              latitude: 42.35,
              localityName: "Boston",
              longitude: -71.07,
            },
            ref: ref("s"),
            sortOrder: 2,
            title: "Lunch",
            type: "meal",
          },
          {
            place: {
              displayName: "Hotel",
              latitude: 42.36,
              localityName: "Boston",
              longitude: -71.05,
            },
            ref: ref("t"),
            sortOrder: 3,
            title: "Hotel",
            type: "hotel",
          },
        ],
        primaryLocality: "Boston",
        ref: ref("u"),
      },
    ],
  });
  const stops = publicOverviewStops(day);
  assert.deepEqual(
    stops.map(({ title }) => title),
    ["Boston", "Cambridge", "Boston"],
  );
  assert.equal(stops.at(-1)?.ref, ref("t"));
  assert.equal(buildPublicOverviewLines(day).length, 2);
});

test("public projection parsing rejects raw planner and owner fields", () => {
  assert.equal(
    publicItinerarySchema.safeParse({ ...itinerary, ownerId: "private" }).success,
    false,
  );
  const rawItem = { ...itinerary.days[0].items[0], details: { bookingReference: "private" } };
  assert.equal(
    publicItinerarySchema.safeParse({
      ...itinerary,
      days: [{ ...itinerary.days[0], items: [rawItem] }],
    }).success,
    false,
  );
  assert.equal(
    publicItinerarySchema.safeParse({
      ...itinerary,
      days: [
        {
          ...itinerary.days[0],
          items: [
            {
              carRental: { action: "pickup", company: "Sixt" },
              ref: ref("x"),
              sortOrder: 1,
              title: "Pickup",
              type: "car_rental",
            },
          ],
        },
      ],
    }).success,
    true,
  );
});

test("quick actions allow HTTP(S), hide raw custom labels, and reject active protocols", () => {
  assert.equal(safeExternalUrl("https://example.com/ticket")?.startsWith("https://"), true);
  assert.equal(safeExternalUrl("http://example.com/menu")?.startsWith("http://"), true);
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("data:text/html,unsafe"), null);
  assert.equal(actionLabel("Ticket"), "Ticket");
  assert.equal(actionLabel("https://very-long.example"), "Open");
});

test("temporary route candidates are shared eligible placed items only", () => {
  const candidates = publicRouteCandidates(itinerary.days[0]);
  assert.deepEqual(
    candidates.map(({ title }) => title),
    ["Museum"],
  );
  const lines = buildPublicRouteLines(
    [
      {
        geometry: {
          destination: { latitude: 35.02, longitude: 135.78 },
          origin: { latitude: 35.01, longitude: 135.77 },
          source: "straight",
        },
        mode: "walk",
        position: 1,
      },
    ],
    "#166b4f",
    "temporary",
  );
  assert.equal(lines.length, 1);
  assert.equal(lines[0].dashed, true);
  assert.equal(lines[0].readOnly, true);
});

test("public day route defaults to all shared stops between previous and current Hotels", () => {
  const previousHotel = {
    place: { displayName: "Hotel One", latitude: 35.01, longitude: 135.76 },
    ref: ref("m"),
    sortOrder: 20,
    title: "Hotel One",
    type: "hotel" as const,
  };
  const activity = {
    place: { displayName: "Temple", latitude: 35.02, longitude: 135.77 },
    ref: ref("n"),
    sortOrder: 10,
    title: "Temple",
    type: "activity" as const,
  };
  const meal = {
    place: { displayName: "Lunch", latitude: 35.03, longitude: 135.78 },
    ref: ref("o"),
    sortOrder: 20,
    title: "Lunch",
    type: "meal" as const,
  };
  const currentHotel = {
    place: { displayName: "Hotel Two", latitude: 35.04, longitude: 135.79 },
    ref: ref("p"),
    sortOrder: 30,
    title: "Hotel Two",
    type: "hotel" as const,
  };
  const unmappedActivity = {
    ref: ref("y"),
    sortOrder: 25,
    title: "Unmapped gallery",
    type: "activity" as const,
  };
  const secondDayRef = ref("z");
  const routeItinerary: PublicItinerary = {
    ...itinerary,
    days: [
      { ...itinerary.days[0], items: [previousHotel] },
      {
        ...itinerary.days[0],
        dayNumber: 2,
        items: [activity, meal, unmappedActivity, currentHotel],
        ref: secondDayRef,
      },
    ],
  };
  const plan = publicDayRoutePlan(routeItinerary, secondDayRef);

  assert.equal(plan.startRef, previousHotel.ref);
  assert.equal(plan.endRef, currentHotel.ref);
  assert.deepEqual(
    plan.items.map(({ title }) => title),
    ["Hotel One", "Temple", "Lunch", "Hotel Two"],
  );
  assert.deepEqual(
    plan.unmappedActivities.map(({ title }) => title),
    ["Unmapped gallery"],
  );
});

test("public Overview uses straight orientation lines and never transport routing", () => {
  const routed: PublicItinerary = {
    ...itinerary,
    days: [
      {
        ...itinerary.days[0],
        primaryLocality: "Tokyo",
        items: [
          {
            place: { displayName: "Tokyo", latitude: 35.6762, longitude: 139.6503 },
            ref: ref("1"),
            sortOrder: 10,
            title: "Tokyo",
            type: "location",
          },
        ],
      },
      {
        ...itinerary.days[0],
        dayNumber: 2,
        primaryLocality: "Sapporo",
        items: [
          { ref: ref("2"), sortOrder: 5, title: "Flight to Sapporo", type: "flight" },
          {
            place: { displayName: "Sapporo", latitude: 43.0618, longitude: 141.3545 },
            ref: ref("3"),
            sortOrder: 10,
            title: "Sapporo",
            type: "location",
          },
        ],
        ref: ref("4"),
      },
    ],
  };

  assert.equal(buildPublicOverviewLines(routed).length, 1);
  assert.equal(buildPublicOverviewLines(routed)[0].dashed, true);
});

test("public route exploration accepts only the modes exposed by each route UI", () => {
  const base = {
    legModes: ["walk"],
    stopRefs: [ref("5"), ref("6")],
    token: "00000000-0000-4000-8000-000000000001",
  };

  assert.equal(
    publicRouteCalculationInputSchema.safeParse({ ...base, dayRef: ref("7") }).success,
    true,
  );
  assert.equal(
    publicRouteCalculationInputSchema.safeParse({
      ...base,
      dayRef: ref("7"),
      legModes: ["taxi"],
    }).success,
    false,
  );
  assert.equal(
    publicOverviewRouteCalculationInputSchema.safeParse({
      ...base,
      legModes: ["train"],
    }).success,
    true,
  );
  assert.equal(publicOverviewRouteCalculationInputSchema.safeParse(base).success, false);
});

test("public and owner Matrix use the same canonical category columns", async () => {
  assert.deepEqual(
    matrixCategoryColumns.map(({ label }) => label),
    ["Locality", "Activities", "Transport", "Hotel", "Car rental", "Meals", "Notes"],
  );
  const publicTable = await readFile(
    new URL("./components/public-table.tsx", import.meta.url),
    "utf8",
  );
  const ownerHeader = await readFile(
    new URL("../itinerary/components/planner-layout-elements.tsx", import.meta.url),
    "utf8",
  );
  const matrixPresentation = await readFile(
    new URL("../itinerary/components/matrix-presentation.tsx", import.meta.url),
    "utf8",
  );
  const dialog = await readFile(new URL("../../components/ui/dialog.tsx", import.meta.url), "utf8");
  assert.match(publicTable, /MatrixGridHeader/);
  assert.match(publicTable, /matrixCategoryColumns/);
  assert.match(ownerHeader, /MatrixGridHeader/);
  assert.match(publicTable, /role="grid"/);
  assert.doesNotMatch(publicTable, /usePlannerMutations|drag|drop|<Input|PlannerWorkspace/);
  assert.doesNotMatch(publicTable, /useState|expandedDays|aria-expanded/);
  assert.match(publicTable, /className="space-y-1"/);
  assert.doesNotMatch(publicTable, /public-item-focus border-b/);
  assert.match(matrixPresentation, /matrix-grid-header sticky top-0 z-40/);
  assert.doesNotMatch(matrixPresentation, /matrix-grid-header sticky top-0 z-\[70\]/);
  assert.match(dialog, /fixed inset-0 z-\[100\]/);
  assert.match(dialog, /z-\[110\]/);
});

test("owner share controls keep a stable key across the server/client toolbar boundary", async () => {
  const tripPage = await readFile(
    new URL("../../app/trips/[tripId]/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(tripPage, /<PublicShareDialog[\s\S]*key="trip-share-controls"/);
});

test("public UI contracts keep Overview time-agnostic, Table scrollable, and the map responsive", async () => {
  const overview = await readFile(
    new URL("./components/public-overview.tsx", import.meta.url),
    "utf8",
  );
  const timeline = await readFile(
    new URL("./components/public-timeline.tsx", import.meta.url),
    "utf8",
  );
  const timelineDay = await readFile(
    new URL("./components/public-timeline-day.tsx", import.meta.url),
    "utf8",
  );
  const journey = await readFile(
    new URL("./components/public-day-journey.tsx", import.meta.url),
    "utf8",
  );
  const journeyGroups = await readFile(
    new URL("./components/public-journey-groups.tsx", import.meta.url),
    "utf8",
  );
  const timelineDestinations = await readFile(
    new URL("./components/public-timeline-destinations.tsx", import.meta.url),
    "utf8",
  );
  const transportRow = await readFile(
    new URL("./components/public-transport-row.tsx", import.meta.url),
    "utf8",
  );
  const overviewIcon = await readFile(
    new URL("./components/public-overview-icon.tsx", import.meta.url),
    "utf8",
  );
  const shell = await readFile(
    new URL("./components/public-itinerary-shell.tsx", import.meta.url),
    "utf8",
  );
  const views = await readFile(
    new URL("./components/public-itinerary-views.tsx", import.meta.url),
    "utf8",
  );
  const shareSettings = await readFile(
    new URL("./components/public-share-dialog.tsx", import.meta.url),
    "utf8",
  );
  const styles = await readAppStyles();
  assert.match(shell, /useState<PublicView>\(itinerary\.settings\.defaultView\)/);
  assert.match(shell, /canonicalPublicViews\.map/);
  assert.doesNotMatch(overview, /right-aligned|time column|sort\(.+startTime/);
  assert.match(overview, /PublicDayJourney/);
  const timelineSources = timeline + timelineDay + timelineDestinations + transportRow;
  const journeySources = journey + journeyGroups + transportRow;
  assert.doesNotMatch(timelineSources, /PublicDayJourney/);
  assert.match(timelineSources, /orderedPublicItems/);
  assert.match(timelineSources, /public-timeline-item/);
  assert.match(timelineSources, /type !== "location"/);
  assert.doesNotMatch(timelineSources, /TimelineStay|DayDetailGroup|Stay · End of day/);
  assert.doesNotMatch(overview + timelineSources, /publicDayStages|stage\.label|stages\.map/);
  assert.match(journey, /publicDayJourney\(day\)/);
  assert.match(journey, /PublicJourneyGroups/);
  assert.match(journeyGroups, /showIcon=\{false\}/);
  assert.doesNotMatch(journeySources, /categoryLabel/);
  assert.match(transportRow, /aria-label="Transport"/);
  assert.match(journey, /items=\{transport\}/);
  assert.match(transportRow, /join\(", "\)/);
  assert.match(transportRow, /truncate whitespace-nowrap/);
  assert.doesNotMatch(transportRow, /rounded-full|overflow-x-auto/);
  const overviewRowSources = overview + journey + journeyGroups + transportRow;
  assert.match(overviewIcon, /flex size-5 shrink-0 items-center justify-center/);
  assert.match(overviewIcon, /className="size-3\.5"/);
  assert.equal(
    overviewRowSources.match(/grid-cols-\[1\.25rem_minmax\(0,1fr\)\]/g)?.length,
    6,
    "every Overview icon row shares one fixed icon column and gap",
  );
  assert.doesNotMatch(overviewRowSources, /gap-1\.5|<Icon className="size-4"/);
  assert.match(journeyGroups, /key=\{`\$\{group\.kind\}:\$\{group\.items\[0\]\.ref\}`\}/);
  assert.doesNotMatch(journeyGroups, /key=\{group\.kind\}/);
  assert.match(timelineSources, /destinations\.length/);
  assert.match(timelineSources, /isPublicTravel/);
  assert.doesNotMatch(overview, /useState|aria-expanded|ChevronDown|hiddenCount/);
  assert.match(styles, /public-itinerary-grid/);
  assert.match(styles, /var\(--public-content-split\)/);
  assert.match(styles, /\.public-content-pane \{[\s\S]*background: var\(--muted\)/);
  assert.match(styles, /\.public-itinerary-shell[\s\S]*overscroll-behavior: none/);
  assert.match(styles, /\.public-itinerary-header[\s\S]*position: sticky/);
  assert.match(styles, /\.public-view-scroll[\s\S]*overscroll-behavior-y: none/);
  assert.doesNotMatch(styles, /public-overview,[\s\S]*public-timeline[\s\S]*min-height: 100%/);
  assert.match(styles, /max-width: 899px/);
  assert.match(styles, /\.public-matrix \.matrix-day-column/);
  assert.match(styles, /width: 6rem/);
  assert.match(styles, /\.public-mobile-map-control/);
  assert.match(shell, /setSelection/);
  assert.match(shell, /onSelectionChange=\{setSelection\}/);
  assert.match(shell, /public-itinerary-shell isolate/);
  assert.match(shell, /public-itinerary-header sticky top-0 z-\[80\]/);
  assert.match(shell, /public-content-pane min-h-0 min-w-0 overflow-hidden/);
  assert.match(views, /public-view-scroll h-full min-w-0/);
  const itemLine = await readFile(
    new URL("./components/public-item-line.tsx", import.meta.url),
    "utf8",
  );
  const publicTable = await readFile(
    new URL("./components/public-table.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(itemLine + publicTable, /onMouseEnter|onFocus=/);
  assert.match(itemLine + publicTable, /event\.key === "Enter"/);
  assert.match(shareSettings, /public-share-settings-dialog[\s\S]*overflow-x-hidden/);
  assert.doesNotMatch(shell, /Compact/);
});

test("route exploration is local-only and never exposes owner persistence controls", async () => {
  const workspace = await readFile(
    new URL("./components/public-map-workspace.tsx", import.meta.url),
    "utf8",
  );
  const dayPanel = await readFile(
    new URL("./components/public-day-route-panel.tsx", import.meta.url),
    "utf8",
  );
  const overviewPanel = await readFile(
    new URL("./components/public-overview-route-panel.tsx", import.meta.url),
    "utf8",
  );
  const routeSummary = await readFile(
    new URL("./components/public-route-summary.tsx", import.meta.url),
    "utf8",
  );
  const sharedRoute = await readFile(
    new URL("./components/public-shared-route-summary.tsx", import.meta.url),
    "utf8",
  );
  const temporaryStops = await readFile(
    new URL("./components/public-temporary-route-stops.tsx", import.meta.url),
    "utf8",
  );
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  const routeSources =
    workspace + dayPanel + overviewPanel + routeSummary + sharedRoute + temporaryStops;
  assert.match(routeSources, /Temporary route/);
  assert.match(routeSources, /Only you/);
  assert.match(routeSources, /Shared route/);
  assert.match(sharedRoute, /key=\{`\$\{stop\.ref\}:\$\{index\}`\}/);
  assert.match(routeSources, /Overview connections/);
  assert.match(routeSources, /Day route/);
  assert.match(routeSources, /Temporary route travel mode/);
  assert.match(routeSources, /Drive/);
  assert.match(routeSources, /Transit/);
  assert.match(routeSources, /Bike/);
  assert.match(routeSources, /Walk/);
  assert.match(routeSources, /Calculate/);
  assert.match(overviewPanel, /Calculate whole trip/);
  assert.match(overviewPanel, /SelectTrigger/);
  assert.match(overviewPanel, /overviewRouteModes/);
  assert.match(routeSources, /publicDayRoutePlan/);
  assert.match(routeSources, /defaultStops/);
  assert.match(routeSources, /No map location/);
  assert.match(routeSources, /publicDayCityLabel/);
  assert.match(routeSources, /Move \$\{item\.title\} earlier/);
  assert.match(routeSources, /Move \$\{item\.title\} later/);
  assert.doesNotMatch(routeSources, /drag|DndContext|useSortable|Set up route/);
  assert.doesNotMatch(routeSources, /aria-label="Reset temporary route"/);
  assert.doesNotMatch(
    routeSources,
    /Save route|Publish route|place search|localStorage|sessionStorage/,
  );
  assert.doesNotMatch(actions, /saveDayRoute|upsert|\.insert\(|\.update\(/);
  assert.match(workspace, /calculatePublicOverviewRoute/);
  assert.match(workspace, /selectedItemRef \? \[selectedItemRef\] : \[\]/);
  assert.match(workspace, /overviewCalculation/);
  assert.match(actions, /must start at the previous day Hotel/);
  assert.match(actions, /must end at the current day Hotel/);
  const providerCall = actions.slice(
    actions.indexOf("calculateGoogleRouteLeg({"),
    actions.indexOf("});", actions.indexOf("calculateGoogleRouteLeg({")),
  );
  assert.doesNotMatch(providerCall, /token|address/);
});

test("sharing and public route security use real QR, safe new tabs, and no-store headers", async () => {
  const tools = await readFile(new URL("./components/share-tools.tsx", import.meta.url), "utf8");
  const quickActions = await readFile(
    new URL("./components/public-quick-actions.tsx", import.meta.url),
    "utf8",
  );
  const config = await readFile(new URL("../../../next.config.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../../app/share/[token]/page.tsx", import.meta.url), "utf8");
  const sharingSources = tools + quickActions + page;
  assert.match(tools, /QRCode\.toCanvas/);
  assert.match(tools, /navigator\.share/);
  assert.match(tools, /AbortError/);
  assert.match(tools, /Tap •••, then choose Send to Chat or Moments/);
  assert.match(quickActions, /rel="noopener noreferrer"/);
  assert.match(quickActions, /target="_blank"/);
  assert.match(config, /private, no-store, max-age=0/);
  assert.match(config, /noindex, nofollow, noarchive/);
  assert.match(config, /strict-origin/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /revalidate = 0/);
  assert.doesNotMatch(sharingSources, /dangerouslySetInnerHTML/);
});

test("public read-only modes share separate one-line transport and rental rows", async () => {
  const timeline = await readFile(
    new URL("./components/public-timeline-day.tsx", import.meta.url),
    "utf8",
  );
  const itemLine = await readFile(
    new URL("./components/public-item-line.tsx", import.meta.url),
    "utf8",
  );
  const transport = await readFile(
    new URL("./components/public-transport-row.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(timeline, /contextLabel|Item \$\{index/);
  assert.match(timeline, /PublicTransportRow/);
  assert.match(transport, /aria-label="Transport"/);
  assert.match(transport, /join\(", "\)/);
  assert.match(transport, /truncate whitespace-nowrap/);
  assert.match(transport, /text-sm/);
  assert.match(transport, /PublicOverviewIcon icon=\{Route\}/);
  assert.match(transport, /PublicOverviewIcon icon=\{CarFront\}/);
  assert.match(transport, /hasMapLocation/);
  assert.match(transport, /data-public-item-ref/);
  assert.match(transport, /Focus map on/);
  assert.doesNotMatch(transport, /rounded-full|overflow-x-auto/);
  assert.doesNotMatch(itemLine, /compactTravel|publicTransferItemLabel|compactRental/);
});
