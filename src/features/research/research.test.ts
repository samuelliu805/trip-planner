import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { plannerResearchCategory } from "./planner-context.ts";
import { initialResearchSegments } from "./journey.ts";
import { researchDecisionSlotKey } from "./decision-slot.ts";
import {
  convertPlanCostBreakdown,
  knownCostFromBreakdown,
  planCostBreakdown,
  planCostSummary,
  sortResearchItems,
} from "./money.ts";
import { parseEcbReferenceRates } from "./exchange-rate-parser.ts";
import { addIsoDateDays, firstPresentIsoDate } from "./date-range.ts";
import { rentalReturnsToPickup } from "./rental-return.ts";
import { deriveOptionImpact } from "./option-impact.ts";
import {
  isReadyToCompare,
  missingComparisonFields,
  researchContextLabel,
  stayNightCount,
  stayPerNightPrice,
} from "./readiness.ts";
import { createResearchItemSchema } from "./schema.ts";
import { researchItemFormSteps, researchItemPriceStep } from "./research-item-form-steps.ts";
import type { ResearchItem, ResearchPlanSnapshot } from "./types.ts";
import {
  compareHrefForPlanContext,
  matchingPlanResearchItems,
  parseResearchCategory,
  parseResearchCategoryRouteSegment,
  researchCategoryHref,
  tripSectionHref,
} from "./urls.ts";

const ids = {
  day: "00000000-0000-4000-8000-000000000003",
  item: "00000000-0000-4000-8000-000000000004",
  trip: "00000000-0000-4000-8000-000000000001",
  variant: "00000000-0000-4000-8000-000000000002",
};

function item(overrides: Partial<ResearchItem> = {}): ResearchItem {
  return {
    category: "stay",
    created_at: "2026-08-09T12:00:00.000Z",
    currency: null,
    day_id: null,
    destination_place_id: null,
    destination_text: null,
    end_date: null,
    end_time: null,
    id: "00000000-0000-4000-8000-000000000010",
    itinerary_item_id: null,
    journey_type: null,
    links: [],
    location_place_id: null,
    location_text: null,
    note: null,
    observed_at: "2026-08-09T12:00:00.000Z",
    origin_text: null,
    origin_place_id: null,
    segments: [],
    source_url: null,
    start_date: null,
    start_time: null,
    title: "Hilton Tokyo",
    total_price_amount: null,
    trip_id: ids.trip,
    updated_at: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

function plan(): ResearchPlanSnapshot {
  return {
    days: [
      {
        date: "2026-09-03",
        dayNumber: 1,
        id: ids.day,
        items: [
          {
            details: { mode: "flight" },
            id: ids.item,
            place_id: null,
            price_amount: null,
            price_currency: null,
            title: "United UA837",
            type: "transport",
          },
        ],
      },
      { date: "2026-09-04", dayNumber: 2, id: "day-2", items: [] },
      { date: "2026-09-05", dayNumber: 3, id: "day-3", items: [] },
      { date: "2026-09-12", dayNumber: 4, id: "day-4", items: [] },
    ],
    variantId: ids.variant,
  };
}

test("ResearchItem saves with category and only a title or only a URL", () => {
  assert.equal(
    createResearchItemSchema.parse({ category: "stay", title: "Hilton Tokyo", tripId: ids.trip })
      .title,
    "Hilton Tokyo",
  );
  assert.equal(
    createResearchItemSchema.parse({
      category: "flight",
      sourceUrl: "https://example.com/fare",
      tripId: ids.trip,
    }).sourceUrl,
    "https://example.com/fare",
  );
  assert.deepEqual(
    createResearchItemSchema.parse({
      category: "flight",
      title: "ANA idea",
      tripId: ids.trip,
    }).segments,
    [],
  );
});

test("all research editors use two pages with scheduling first and price on Details", () => {
  assert.deepEqual(
    researchItemFormSteps("flight").map(({ id, title }) => [id, title]),
    [
      ["primary", "Flight"],
      ["details", "Details"],
    ],
  );
  assert.deepEqual(
    researchItemFormSteps("stay").map(({ id, title }) => [id, title]),
    [
      ["primary", "Hotel"],
      ["details", "Details"],
    ],
  );
  assert.equal(researchItemFormSteps("stay")[0].title, "Hotel");
  assert.equal(researchItemFormSteps("rental")[0].title, "Rental car");
  assert.equal(researchItemFormSteps("train").length, 2);
  assert.equal(researchItemFormSteps("rental").length, 2);
  assert.equal(researchItemPriceStep("flight"), "details");
  assert.equal(researchItemPriceStep("train"), "details");
  assert.equal(researchItemPriceStep("rental"), "details");
  assert.equal(researchItemPriceStep("stay"), "details");
});

test("route-only journey drafts normalize blank dates before ISO validation", () => {
  assert.equal(firstPresentIsoDate("", undefined, null), null);
  assert.equal(firstPresentIsoDate("", "2026-10-04"), "2026-10-04");
});

test("each journey segment keeps its own carrier", () => {
  const parsed = createResearchItemSchema.parse({
    category: "flight",
    segments: [
      { carrier: "ANA", departureDate: "2026-10-04", destination: "NRT", origin: "SFO" },
      { carrier: "United", departureDate: "2026-10-12", destination: "SFO", origin: "NRT" },
    ],
    title: "Round trip",
    tripId: ids.trip,
  });
  assert.deepEqual(
    parsed.segments.map(({ carrier }) => carrier),
    ["ANA", "United"],
  );
});

test("price is optional and partial ResearchItems derive as Ideas", () => {
  const parsed = createResearchItemSchema.parse({
    category: "stay",
    note: "Check the member rate",
    tripId: ids.trip,
  });
  assert.equal(parsed.totalPriceAmount, undefined);
  assert.equal(isReadyToCompare(item()), false);
  assert.deepEqual(missingComparisonFields(item()), ["price", "location", "dates"]);
});

test("updating the same item makes it ready without changing its identity", () => {
  const partial = item();
  const updated = {
    ...partial,
    currency: "USD",
    end_date: "2026-10-08",
    location_text: "Tokyo",
    start_date: "2026-10-04",
    total_price_amount: 642,
  };
  assert.equal(updated.id, partial.id);
  assert.equal(isReadyToCompare(updated), true);
});

test("Flight readiness requires price, currency, route, and depart date", () => {
  assert.equal(
    isReadyToCompare(
      item({
        category: "flight",
        currency: "USD",
        destination_text: "Tokyo",
        origin_text: "SFO",
        start_date: "2026-10-04",
        total_price_amount: 620,
      }),
    ),
    true,
  );
});

test("journey-based Flight readiness requires every expected segment", () => {
  const flight = item({
    category: "flight",
    currency: "USD",
    destination_text: "NRT",
    end_date: "2026-10-12",
    journey_type: "round_trip",
    origin_text: "SFO",
    start_date: "2026-10-04",
    total_price_amount: 620,
  });
  assert.equal(
    isReadyToCompare({
      ...flight,
      segments: [{ departureDate: "2026-10-04", destination: "NRT", origin: "SFO" }],
    }),
    false,
  );
  assert.match(
    missingComparisonFields({
      ...flight,
      segments: [{ departureDate: "2026-10-04", destination: "NRT", origin: "SFO" }],
    }).join(","),
    /flight segments/,
  );
  assert.equal(
    isReadyToCompare({
      ...flight,
      segments: [
        { departureDate: "2026-10-04", destination: "NRT", origin: "SFO" },
        { departureDate: "2026-10-12", destination: "SFO", origin: "NRT" },
      ],
    }),
    true,
  );
});

test("Stay readiness and per-night price are derived", () => {
  const stay = item({
    currency: "USD",
    end_date: "2026-10-08",
    location_text: "Tokyo",
    start_date: "2026-10-04",
    total_price_amount: 642,
  });
  assert.equal(isReadyToCompare(stay), true);
  assert.equal(stayNightCount(stay), 4);
  assert.equal(stayPerNightPrice(stay), 160.5);
  assert.equal(researchContextLabel(stay), "Tokyo · Oct 4–Oct 8");
});

test("Rental same-place return is inferred from persisted place identity", () => {
  assert.equal(
    rentalReturnsToPickup(
      item({
        category: "rental",
        destination_place_id: "00000000-0000-4000-8000-000000000020",
        destination_text: "SFO",
        origin_place_id: "00000000-0000-4000-8000-000000000020",
        origin_text: "SFO",
      }),
    ),
    true,
  );
  assert.equal(
    rentalReturnsToPickup(
      item({ category: "rental", destination_text: "LAX", origin_text: "SFO" }),
    ),
    false,
  );
});

test("zero is a real comparison-ready price and Stay checkout defaults to the next day", () => {
  assert.equal(
    isReadyToCompare(
      item({
        currency: "USD",
        end_date: "2026-10-05",
        location_text: "Tokyo",
        start_date: "2026-10-04",
        total_price_amount: 0,
      }),
    ),
    true,
  );
  assert.equal(addIsoDateDays("2026-10-04", 1), "2026-10-05");
});

test("Train and Rental readiness use their minimal category context", () => {
  const common = { currency: "JPY", start_date: "2026-10-04", total_price_amount: 8000 };
  assert.equal(
    isReadyToCompare(
      item({ ...common, category: "train", destination_text: "Kyoto", origin_text: "Tokyo" }),
    ),
    true,
  );
  assert.equal(
    isReadyToCompare(
      item({ ...common, category: "rental", end_date: "2026-10-08", origin_text: "Tokyo" }),
    ),
    true,
  );
});

test("Known Cost sums canonical Plan prices and keeps currencies separate", () => {
  const values = knownCostFromBreakdown(
    planCostBreakdown(
      [
        ["flight", 842.25, "USD"],
        ["stay", 610, "USD"],
        ["train", 76000, "JPY"],
        ["unpriced", null, null],
      ].map(([id, price_amount, price_currency], index) => ({
        dayNumber: index + 1,
        id: String(id),
        price_amount: price_amount as number | null,
        price_currency: price_currency as string | null,
        title: String(id),
        type: "transport" as const,
      })),
    ),
  );
  assert.deepEqual(values, [
    { amount: 76000, currency: "JPY" },
    { amount: 1452.25, currency: "USD" },
  ]);
});

test("Known Cost breakdown exposes every canonical priced Plan item exactly once", () => {
  const lines = planCostBreakdown([
    {
      dayNumber: 1,
      id: "flight",
      price_amount: 842.15,
      price_currency: "USD",
      title: "ANA",
      type: "transport",
    },
    {
      dayNumber: 2,
      id: "activity",
      price_amount: 25,
      price_currency: "USD",
      title: "Museum",
      type: "activity",
    },
    {
      dayNumber: 3,
      id: "unpriced",
      price_amount: null,
      price_currency: null,
      title: "Walk",
      type: "activity",
    },
  ]);
  assert.deepEqual(
    lines.map(({ itemId }) => itemId),
    ["flight", "activity"],
  );
  assert.deepEqual(knownCostFromBreakdown(lines), [{ amount: 867.15, currency: "USD" }]);
});

test("Plan Cost converts every canonical line to the Trip currency with one dated rate table", () => {
  const rates = parseEcbReferenceRates(`
    <Cube><Cube time="2026-08-11">
      <Cube currency="USD" rate="2.0"/>
      <Cube currency="JPY" rate="200.0"/>
    </Cube></Cube>
  `);
  assert.ok(rates);
  const lines = convertPlanCostBreakdown(
    planCostBreakdown([
      {
        dayNumber: 1,
        id: "usd",
        price_amount: 5,
        price_currency: "USD",
        title: "Flight",
        type: "transport",
      },
      {
        dayNumber: 2,
        id: "jpy",
        price_amount: 1000,
        price_currency: "JPY",
        title: "Stay",
        type: "hotel",
      },
    ]),
    "USD",
    rates,
  );
  assert.deepEqual(
    lines.map(({ convertedAmount, itemId }) => ({ convertedAmount, itemId })),
    [
      { convertedAmount: 10, itemId: "jpy" },
      { convertedAmount: 5, itemId: "usd" },
    ],
  );
  assert.deepEqual(planCostSummary(lines, "USD", rates), {
    amount: 15,
    complete: true,
    converted: true,
    currency: "USD",
    itemCount: 2,
    rateDate: "2026-08-11",
    unavailableCurrencies: [],
  });
});

test("price sorting partitions currencies and sorts numerically only within one currency", () => {
  const rows = [
    item({
      currency: "JPY",
      id: "jpy-low",
      location_text: "Tokyo",
      start_date: "2026-10-04",
      end_date: "2026-10-05",
      total_price_amount: 5000,
    }),
    item({
      currency: "USD",
      id: "usd-high",
      location_text: "Tokyo",
      start_date: "2026-10-04",
      end_date: "2026-10-05",
      total_price_amount: 900,
    }),
    item({
      currency: "USD",
      id: "usd-low",
      location_text: "Tokyo",
      start_date: "2026-10-04",
      end_date: "2026-10-05",
      total_price_amount: 610,
    }),
    item({ id: "idea" }),
  ];
  assert.deepEqual(
    sortResearchItems(rows, "price", "USD").map(({ id }) => id),
    ["usd-low", "usd-high", "jpy-low", "idea"],
  );
});

test("legacy round trips infer exactly one reverse leg from the same two cities", () => {
  assert.deepEqual(
    initialResearchSegments({
      destination: "Tokyo",
      endDate: "2026-09-12",
      origin: "San Francisco",
      startDate: "2026-09-03",
    }).map(({ departureDate, destination, origin }) => ({
      departureDate,
      destination,
      origin,
    })),
    [
      { departureDate: "2026-09-03", destination: "Tokyo", origin: "San Francisco" },
      { departureDate: "2026-09-12", destination: "San Francisco", origin: "Tokyo" },
    ],
  );
});

test("decision slots prefer canonical item, then Day context, then normalized comparison context", () => {
  assert.equal(researchDecisionSlotKey(item({ itinerary_item_id: ids.item })), `item:${ids.item}`);
  assert.equal(researchDecisionSlotKey(item({ day_id: ids.day })), `day:${ids.day}:stay`);
  assert.equal(
    researchDecisionSlotKey(
      item({
        category: "flight",
        destination_text: " Tokyo ",
        origin_text: "SFO",
        start_date: "2026-09-03",
      }),
    ),
    "context:flight:sfo:tokyo:-:2026-09-03:-",
  );
});

test("OptionImpact names exact, shifted, longer, and shorter Plan outcomes", () => {
  const flight = item({
    category: "flight",
    currency: "USD",
    destination_text: "NRT",
    end_date: "2026-09-12",
    itinerary_item_id: ids.item,
    origin_text: "SFO",
    start_date: "2026-09-03",
    total_price_amount: 842,
  });
  assert.equal(deriveOptionImpact(flight, plan()).code, "exact_fit");
  assert.equal(
    deriveOptionImpact({ ...flight, itinerary_item_id: null }, plan()).currentTitle,
    undefined,
  );
  assert.equal(
    deriveOptionImpact({ ...flight, start_date: "2026-09-05", end_date: "2026-09-14" }, plan())
      .code,
    "date_shift_same_duration",
  );
  const longer = deriveOptionImpact({ ...flight, end_date: "2026-09-15" }, plan());
  assert.equal(longer.code, "structural_change");
  assert.equal(longer.planAction, "extend_plan");
  assert.equal(longer.dayDelta, 3);
  const shorter = deriveOptionImpact({ ...flight, end_date: "2026-09-10" }, plan());
  assert.equal(shorter.planAction, "remove_days_first");
  assert.equal(shorter.dayDelta, -2);
  assert.equal(
    deriveOptionImpact({ ...flight, itinerary_item_id: "missing" }, plan()).code,
    "manual_review",
  );
});

test("OptionImpact makes a Rental pickup/return pair applicable on matching Plan Days", () => {
  const rental = item({
    category: "rental",
    currency: "USD",
    destination_text: "NRT",
    end_date: "2026-09-12",
    origin_text: "Tokyo",
    start_date: "2026-09-03",
    total_price_amount: 340,
  });
  const impact = deriveOptionImpact(rental, plan());
  assert.equal(impact.planAction, "apply");
  assert.equal(impact.affectedDayCount, 2);
});

test("Trip navigation uses Plan and one Research route", () => {
  assert.equal(
    tripSectionHref(ids.trip, "plan", ids.variant),
    `/trips/${ids.trip}?variant=${ids.variant}`,
  );
  assert.equal(
    tripSectionHref(ids.trip, "compare", ids.variant),
    `/trips/${ids.trip}/compare/flights?variant=${ids.variant}`,
  );
  assert.equal(
    researchCategoryHref(ids.trip, "rental", { variantId: ids.variant }),
    `/trips/${ids.trip}/compare/rentals?variant=${ids.variant}`,
  );
});

test("Plan comparison URLs carry stable category, day, item, and variant context", () => {
  const context = {
    category: "stay" as const,
    dayId: ids.day,
    itemId: ids.item,
    variantId: ids.variant,
  };
  const href = compareHrefForPlanContext(ids.trip, context);
  const url = new URL(href, "https://trip-planner.invalid");
  assert.equal(url.pathname, `/trips/${ids.trip}/compare/stays`);
  assert.equal(url.searchParams.get("category"), null);
  assert.equal(url.searchParams.get("dayId"), ids.day);
  assert.equal(url.searchParams.get("itemId"), ids.item);
  assert.equal(url.searchParams.get("variant"), ids.variant);
});

test("category query parsing accepts only the four price categories", () => {
  assert.equal(parseResearchCategory("flight"), "flight");
  assert.equal(parseResearchCategory("activity"), undefined);
  assert.equal(parseResearchCategoryRouteSegment("trains"), "train");
  assert.equal(parseResearchCategoryRouteSegment("activities"), undefined);
});

test("contextual comparisons include exact and same-Day alternatives", () => {
  const rows = [
    item({ category: "stay", day_id: ids.day, itinerary_item_id: ids.item }),
    item({ day_id: ids.day, id: "00000000-0000-4000-8000-000000000011" }),
  ];
  assert.equal(
    matchingPlanResearchItems(rows, {
      category: "stay",
      dayId: ids.day,
      itemId: ids.item,
      variantId: ids.variant,
    }).length,
    2,
  );
});

test("Plan context maps only relevant price-comparison categories", () => {
  assert.equal(plannerResearchCategory({ id: "hotel" } as never), "stay");
  assert.equal(plannerResearchCategory({ id: "car_rental" } as never), "rental");
  assert.equal(
    plannerResearchCategory(
      { id: "transport" } as never,
      {
        details: { mode: "flight" },
        type: "transport",
      } as never,
    ),
    "flight",
  );
  assert.equal(plannerResearchCategory({ id: "activities" } as never), undefined);
});

test("Ideas & Options has direct category routes and instant in-workspace switching", async () => {
  const [legacyPage, categoryPage, route, workspace] = await Promise.all(
    [
      "../../app/trips/[tripId]/compare/page.tsx",
      "../../app/trips/[tripId]/compare/[category]/page.tsx",
      "./compare-route.tsx",
      "./components/compare-workspace.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const nav = await readFile(
    new URL("../trips/components/trip-app-bar.tsx", import.meta.url),
    "utf8",
  );
  assert.match(legacyPage, /redirect\(/);
  assert.match(categoryPage, /parseResearchCategoryRouteSegment/);
  assert.match(categoryPage, /ResearchCompareRoute/);
  assert.match(route, /getResearchPlanSnapshot/);
  assert.match(workspace, /window\.history\.pushState/);
  assert.match(nav, /label: "Ideas & Options"/);
  assert.match(nav, /next\/link/);
  assert.doesNotMatch(
    `${legacyPage}\n${categoryPage}\n${nav}`,
    /activeTab|setActiveTab|\/ideas|\/options/,
  );
});

test("Trip detail keeps Ideas filters inline and uses one mobile destination tab bar", async () => {
  const [
    planPage,
    comparePage,
    appBar,
    barMenu,
    planToolbar,
    contextBar,
    compareWorkspace,
    routeState,
  ] = await Promise.all(
    [
      "../../app/trips/[tripId]/page.tsx",
      "../../app/trips/[tripId]/compare/page.tsx",
      "../trips/components/trip-app-bar.tsx",
      "../trips/components/trip-app-bar-menu.tsx",
      "../itinerary/components/planner-toolbar.tsx",
      "../itinerary/components/planner-context-bar.tsx",
      "./components/compare-workspace.tsx",
      "./components/trip-detail-route-state.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  assert.match(appBar, /ariaLabel="Trip sections"/);
  assert.match(appBar, /aria-current/);
  assert.match(appBar, /label: "Plan"/);
  assert.match(appBar, /label: "Ideas & Options"/);
  assert.match(appBar, /useLinkStatus/);
  assert.match(appBar, /Opening \{label\}/);
  assert.match(planToolbar, /<TripAppBar[\s\S]*actions=\{<PlannerContextActions/);
  assert.match(planToolbar, /menuItems=\{<PlannerContextMenuItems/);
  assert.match(compareWorkspace, /aria-label="Ideas filters"/);
  assert.doesNotMatch(compareWorkspace, /research-context-bar/);
  assert.doesNotMatch(routeState, /research-context-bar/);
  assert.match(compareWorkspace, /<TripMobileTabBar/);
  // The plan actions live inside the single app bar row; no second top bar may reappear.
  assert.doesNotMatch(contextBar, /aria-label="Plan context"|min-h-14|is-idle/);
  assert.doesNotMatch(contextBar, /TripSectionNav|TripMobileTabBar/);
  assert.doesNotMatch(appBar, /TripSectionNav/);
  assert.doesNotMatch(`${planPage}\n${comparePage}`, /TripSectionNav/);
  assert.doesNotMatch(planToolbar, /PlannerEditingToolbar/);
  assert.doesNotMatch(compareWorkspace, /<h1|trip\.title/);
  assert.match(barMenu, /\{accountEmail\}/);
  assert.match(barMenu, /Log out/);
  assert.match(barMenu, /Trip settings/);
  assert.match(barMenu, /Share trip/);
  assert.match(barMenu, /Delete trip/);
  assert.match(barMenu, /extraItems && \(onShareTrip \|\| onTripSettings \|\| onDeleteTrip\)/);
  assert.match(appBar, /<DeleteTripDialog/);
  assert.match(appBar, /countActiveSharePages\(tripId\)/);
  assert.match(appBar, /OPEN_SHARE_SETTINGS_EVENT/);
  assert.match(appBar, /Saving/);
  assert.doesNotMatch(appBar, />Saved</);
  assert.doesNotMatch(appBar, /Open settings for/);
});

test("selection, Apply, and Revert use owner-authorized RPC boundaries with durable history", async () => {
  const serverActions = (
    await Promise.all(
      ["./actions.ts", "./plan-actions.ts"].map((path) =>
        readFile(new URL(path, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
  const planActions = (
    await Promise.all(
      ["./components/research-plan-actions.tsx", "./components/research-apply-dialogs.tsx"].map(
        (path) => readFile(new URL(path, import.meta.url), "utf8"),
      ),
    )
  ).join("\n");
  const foundationMigration = await readFile(
    new URL(
      "../../../supabase/migrations/20260810154805_phase_6b_plan_selection_apply_revert.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const applyMigration = await readFile(
    new URL(
      "../../../supabase/migrations/20260811080457_research_apply_v2_schedule_and_details.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const readinessMigration = await readFile(
    new URL(
      "../../../supabase/migrations/20260811084649_harden_research_journey_readiness.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const migration = `${foundationMigration}\n${applyMigration}\n${readinessMigration}`;
  assert.doesNotMatch(serverActions, /export async function (select|clear)Research/);
  assert.match(serverActions, /rpc\("apply_research_item_to_variant_v2"/);
  assert.match(serverActions, /rpc\("revert_research_plan_application"/);
  assert.doesNotMatch(planActions, /Select for Plan/);
  assert.match(planActions, /Apply to Plan/);
  assert.match(planActions, /We’ll update the Plan for you/);
  assert.match(planActions, /keep_extra_days/);
  assert.match(planActions, /Revert/);
  assert.match(migration, /create table public\.variant_research_selections/);
  assert.match(migration, /create table public\.research_plan_applications/);
  assert.match(migration, /security definer/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /status = 'reverted'/);
  assert.match(migration, /select_research_item_for_variant/);
  assert.match(readinessMigration, /research_item_is_comparison_ready_v2/);
  assert.match(readinessMigration, /jsonb_array_length\(target_segments\) < 2/);
  assert.match(readinessMigration, /to authenticated/);
  assert.doesNotMatch(migration, /grant execute[^;]+to anon/);
});

test("Apply review offers large explicit target choices only when matching Plan items are ambiguous", async () => {
  const actions = await readFile(
    new URL("./components/research-plan-actions.tsx", import.meta.url),
    "utf8",
  );
  const dialog = await readFile(
    new URL("./components/research-apply-dialogs.tsx", import.meta.url),
    "utf8",
  );
  assert.match(actions, /targetItemId/);
  assert.match(actions, /day\.date === item\.start_date/);
  assert.match(dialog, /Which Plan item should be replaced\?/);
  assert.match(dialog, /type="radio"/);
  assert.match(dialog, /min-h-14/);
});

test("the same-row update path never creates a separate Option", async () => {
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  assert.match(actions, /from\("research_items"\)[\s\S]*\.update/);
  assert.doesNotMatch(actions, /research_options|create_research_option|sourceIdea/);
});

test("research writes and contextual capture cannot mutate Plan or Routes", async () => {
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  const planner = await readFile(
    new URL("./components/planner-research-actions.tsx", import.meta.url),
    "utf8",
  );
  assert.match(planner, /Saved · Plan unchanged/);
  assert.doesNotMatch(
    `${actions}\n${planner}`,
    /router\.push|redirect\(|createItineraryItem|updateItineraryItem|saveDayRoute|GoogleRoutes/,
  );
  assert.doesNotMatch(actions, /day_route_calculations|itinerary_items/);
});

test("Trip detail shell contains document scrolling separately from Matrix rules", async () => {
  const styles = await readFile(
    new URL("../../app/trip-detail-workspace.css", import.meta.url),
    "utf8",
  );
  const plannerStyles = await readFile(
    new URL("../../app/planner-workspace.css", import.meta.url),
    "utf8",
  );
  assert.match(styles, /body:has\(\.trip-detail-page\)[\s\S]*overflow: hidden/);
  assert.match(styles, /trip-detail-scroller[\s\S]*overflow-anchor: none/);
  assert.match(
    plannerStyles,
    /planner-matrix[\s\S]*overscroll-behavior-x: none[\s\S]*overscroll-behavior-y: auto/,
  );
});

test("Compare keeps one responsive inline filter row below the Trip App Bar", async () => {
  const categorySelector = await readFile(
    new URL("./components/category-selector.tsx", import.meta.url),
    "utf8",
  );
  const mobileCategoryPicker = await readFile(
    new URL("./components/mobile-category-picker.tsx", import.meta.url),
    "utf8",
  );
  const workspace = await readFile(
    new URL("./components/compare-workspace.tsx", import.meta.url),
    "utf8",
  );
  const dialog = await readFile(
    new URL("./components/research-item-dialog.tsx", import.meta.url),
    "utf8",
  );
  const route = await readFile(
    new URL("./components/trip-detail-route.tsx", import.meta.url),
    "utf8",
  );
  const sortMenu = await readFile(
    new URL("./components/research-sort-menu.tsx", import.meta.url),
    "utf8",
  );
  assert.match(categorySelector, /aria-label="Price category"/);
  assert.match(categorySelector, /hidden w-28 min-w-0 sm:block lg:hidden/);
  assert.match(categorySelector, /hidden grid-cols-4 gap-1 rounded-xl bg-muted\/70 p-1 lg:grid/);
  assert.doesNotMatch(categorySelector, /grid-cols-2/);
  assert.match(mobileCategoryPicker, /SheetContent[\s\S]*side="bottom"/);
  assert.match(mobileCategoryPicker, /min-h-16/);
  assert.match(mobileCategoryPicker, /Mobile price categories/);
  assert.match(mobileCategoryPicker, /safe-area-inset-bottom/);
  assert.match(workspace, /aria-label="Ideas filters"/);
  assert.doesNotMatch(workspace, /saved in Ideas &amp; Options|research-context-bar/);
  assert.match(workspace, /TripMobileTabBar/);
  assert.match(workspace, /CategorySelector[\s\S]*ResearchSortMenu[\s\S]*ResearchItemDialog/);
  assert.match(route, /\{appBar\}/);
  assert.match(sortMenu, /className="min-h-11"/);
  assert.match(dialog, /size-11 shrink-0 p-0 sm:h-11 sm:w-auto sm:px-4/);
  assert.match(dialog, /hidden sm:inline[\s\S]*Add price or idea/);
});

test("mobile Research chrome stays on one row and add forms use the shared progressive editor", async () => {
  const [
    workspace,
    planContext,
    planMenu,
    fields,
    dialog,
    form,
    values,
    journey,
    multiCity,
    schedule,
    segmentDetails,
    commonFields,
    dateRange,
    editorStyles,
    actions,
    migration,
  ] = await Promise.all([
    readFile(new URL("./components/compare-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../itinerary/components/planner-context-bar.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../itinerary/components/planner-context-menu-items.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("./components/research-item-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/research-item-dialog.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/research-item-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("./research-item-form-values.ts", import.meta.url), "utf8"),
    readFile(new URL("./components/research-journey-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/research-multi-city-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/research-schedule-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/research-segment-detail-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/research-item-common-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("./components/date-range-fields.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../app/planner-item-dialog.css", import.meta.url), "utf8"),
    readFile(new URL("./components/research-plan-actions.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../supabase/migrations/20260811121345_detach_deleted_research_history.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(workspace, /items-center justify-between gap-3/);
  assert.doesNotMatch(workspace, /KnownCost|PlanCostBreakdown/);
  assert.doesNotMatch(planContext, /Known Cost ·/);
  assert.match(planContext, /PlanCostMenu/);
  assert.match(fields, /label="Hotel or area"/);
  assert.match(fields, /<DateRangeFields[\s\S]*endLabel="Check-out"/);
  assert.match(fields, /minimumNights=\{1\}/);
  assert.match(fields, /startLabel="Check-in"/);
  assert.match(fields, /Return to the pick-up location/);
  assert.match(fields, /name="returnToPickup"/);
  assert.match(values, /returnToPickup[\s\S]*originPlaceId[\s\S]*destinationPlaceId/);
  assert.match(dialog, /<PlannerEditorScreen/);
  assert.match(dialog, /editorKind="research"/);
  assert.match(form, /<PlannerEditorForm/);
  assert.match(form, /<PlannerEditorHeader/);
  assert.match(form, /<PlannerItemStepNav/);
  assert.match(journey, /label="From"[\s\S]*label="To"/);
  assert.doesNotMatch(journey + multiCity + commonFields, /<details|Add times \(optional\)/);
  assert.match(schedule, /label="Departure"[\s\S]*label="Arrival"/);
  assert.match(schedule, /planner-editor-compound-field/);
  assert.match(journey, /Airline & flight number/);
  assert.match(segmentDetails, /placeholder="Airline"/);
  assert.match(segmentDetails, /placeholder="Flight number"/);
  assert.doesNotMatch(segmentDetails, /operating airline|rounded-xl border/);
  assert.doesNotMatch(journey, /Flight \{index \+ 1\}/);
  assert.match(dateRange, /showPicker/);
  assert.match(dateRange, /openDatePicker\(endRef\.current\)/);
  assert.match(editorStyles, /data-editor-kind="research"[\s\S]*height: 100dvh !important/);
  assert.doesNotMatch(editorStyles, /data-editor-kind="research"\] \.planner-item-form-header/);
  assert.match(
    editorStyles,
    /data-editor-kind="research"[\s\S]*4rem \+ env\(safe-area-inset-bottom\)/,
  );
  assert.doesNotMatch(actions, /clearResearchSelection|Remove selection|<X/);
  assert.match(planMenu, /sourceItem=\{researchSourceItem\}/);
  assert.match(migration, /alter column source_research_item_id drop not null/);
  assert.match(migration, /on delete set null \(source_research_item_id\)/);
});

test("contextual Save captures canonical booking fields, places, prices, and every link", async () => {
  const [actions, capture, migration] = await Promise.all([
    readFile(new URL("./components/planner-research-actions.tsx", import.meta.url), "utf8"),
    readFile(new URL("./capture-plan-item.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../supabase/migrations/20260811181150_distribute_stay_costs_and_capture_links.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(actions, /capturePlanItemAsResearch/);
  assert.match(actions, /Saved all Plan details/);
  assert.match(capture, /item\.links/);
  assert.match(capture, /locationPlaceId: item\.place_id/);
  assert.match(capture, /arrivalTime|serviceNumber|checkOutDate|rentalReturn/);
  assert.match(capture, /addIsoDateDays\(checkInDate, 1\)/);
  assert.match(migration, /add column links jsonb not null default '\[\]'/);
  assert.match(migration, /jsonb_typeof\(links\) = 'array'/);
});

test("research attachments use draft sessions and transfer through Apply and Revert", async () => {
  const [form, attachments, uploadClient, migration] = await Promise.all([
    readFile(new URL("./components/research-item-form.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../attachments/components/research-attachments-section.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../attachments/upload-client.ts", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../../../supabase/migrations/20260823120000_research_item_attachments_and_segment_carriers.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(form, /useAttachmentEditSession/);
  assert.match(form, /targetKind: "research"/);
  assert.match(attachments, /researchItemId: item\.id/);
  assert.match(uploadClient, /research\/\$\{researchItemId\}/);
  assert.match(
    migration,
    /num_nonnulls\(itinerary_item_id, research_item_id, research_application_id\) = 1/,
  );
  assert.match(migration, /copy_research_assets_to_items_v1/);
  assert.match(migration, /applied_from_research_application_id/);
  assert.match(migration, /Private Apply-time attachment snapshot/);
  assert.match(migration, /revert_research_plan_application_phase_attachment_transfer/);
});

test("Applied is a one-time Plan snapshot refreshed after canonical mutations", async () => {
  const [migration, itemMutations, dayMutations, query] = await Promise.all([
    readFile(
      new URL(
        "../../../supabase/migrations/20260811185219_expire_research_apply_after_plan_change.sql",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../itinerary/item-mutations.ts", import.meta.url), "utf8"),
    readFile(new URL("../itinerary/day-mutations.ts", import.meta.url), "utf8"),
    readFile(new URL("./research-query.ts", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /generate_series\(required_start, required_end/);
  assert.match(migration, /one-time snapshot/);
  assert.match(migration, /item\.details ->> 'researchSourceId'/);
  assert.match(itemMutations, /refreshResearchWorkspace/);
  assert.match(dayMutations, /refreshResearchWorkspace/);
  assert.match(query, /refetchOnMount: "always"/);
  assert.match(query, /refetchType: "all"/);
});
