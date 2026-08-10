import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { plannerResearchCategory } from "./planner-context.ts";
import {
  isReadyToCompare,
  missingComparisonFields,
  researchContextLabel,
  stayNightCount,
  stayPerNightPrice,
} from "./readiness.ts";
import { createResearchItemSchema } from "./schema.ts";
import type { ResearchItem } from "./types.ts";
import {
  compareHrefForPlanContext,
  matchingPlanResearchItems,
  parseResearchCategory,
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
    destination_text: null,
    end_date: null,
    id: "00000000-0000-4000-8000-000000000010",
    itinerary_item_id: null,
    location_text: null,
    note: null,
    observed_at: "2026-08-09T12:00:00.000Z",
    origin_text: null,
    source_url: null,
    start_date: null,
    title: "Hilton Tokyo",
    total_price_amount: null,
    trip_id: ids.trip,
    updated_at: "2026-08-09T12:00:00.000Z",
    ...overrides,
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

test("Trip navigation uses Plan and one Ideas & Options route", () => {
  assert.equal(
    tripSectionHref(ids.trip, "plan", ids.variant),
    `/trips/${ids.trip}?variant=${ids.variant}`,
  );
  assert.equal(
    tripSectionHref(ids.trip, "compare", ids.variant),
    `/trips/${ids.trip}/compare?variant=${ids.variant}`,
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
  assert.equal(url.pathname, `/trips/${ids.trip}/compare`);
  assert.equal(url.searchParams.get("category"), "stay");
  assert.equal(url.searchParams.get("dayId"), ids.day);
  assert.equal(url.searchParams.get("itemId"), ids.item);
  assert.equal(url.searchParams.get("variant"), ids.variant);
});

test("category query parsing accepts only the four price categories", () => {
  assert.equal(parseResearchCategory("flight"), "flight");
  assert.equal(parseResearchCategory("activity"), undefined);
});

test("contextual counts prefer exact item references", () => {
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
    1,
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

test("compare is a real direct-load App Router page without local tab routing", async () => {
  const page = await readFile(
    new URL("../../app/trips/[tripId]/compare/page.tsx", import.meta.url),
    "utf8",
  );
  const nav = await readFile(new URL("./components/trip-section-nav.tsx", import.meta.url), "utf8");
  assert.match(page, /export default async function ComparePage/);
  assert.match(nav, /Ideas & Options/);
  assert.match(nav, /next\/link/);
  assert.doesNotMatch(`${page}\n${nav}`, /activeTab|setActiveTab|\/ideas|\/options/);
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
  assert.match(plannerStyles, /planner-matrix[\s\S]*overscroll-behavior: none/);
});

test("Compare uses one responsive command row below the Trip navigation", async () => {
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
  assert.match(categorySelector, /hidden grid-cols-4 gap-1\.5 lg:grid/);
  assert.doesNotMatch(categorySelector, /grid-cols-2/);
  assert.match(mobileCategoryPicker, /SheetContent[\s\S]*side="bottom"/);
  assert.match(mobileCategoryPicker, /min-h-16/);
  assert.match(mobileCategoryPicker, /Mobile price categories/);
  assert.match(mobileCategoryPicker, /safe-area-inset-bottom/);
  assert.match(workspace, /aria-label="Compare controls"/);
  assert.match(workspace, /saved · Plan unchanged/);
  assert.match(workspace, /CategorySelector[\s\S]*ResearchSortMenu[\s\S]*ResearchItemDialog/);
  assert.doesNotMatch(route, /trip-detail-header/);
  assert.match(sortMenu, /className="min-h-11"/);
  assert.match(dialog, /size-11 shrink-0 p-0 sm:h-11 sm:w-auto sm:px-4/);
  assert.match(dialog, /hidden sm:inline[\s\S]*Add price or idea/);
});
