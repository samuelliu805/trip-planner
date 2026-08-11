import { researchCategories, type PlanResearchItem, type ResearchCategory } from "./types.ts";

export type TripSection = "plan" | "compare";

export const researchCategoryRouteSegments: Record<ResearchCategory, string> = {
  flight: "flights",
  rental: "rentals",
  stay: "stays",
  train: "trains",
};

export function parseResearchCategoryRouteSegment(value?: string): ResearchCategory | undefined {
  return researchCategories.find((category) => researchCategoryRouteSegments[category] === value);
}

export function researchCategoryHref(
  tripId: string,
  category: ResearchCategory,
  options: { dayId?: string; itemId?: string; variantId?: string } = {},
) {
  const params = new URLSearchParams();
  if (options.variantId) params.set("variant", options.variantId);
  if (options.dayId) params.set("dayId", options.dayId);
  if (options.itemId) params.set("itemId", options.itemId);
  const query = params.size ? `?${params.toString()}` : "";
  return `/trips/${tripId}/compare/${researchCategoryRouteSegments[category]}${query}`;
}

export function tripSectionHref(
  tripId: string,
  section: TripSection,
  variantId?: string,
  researchCategory: ResearchCategory = "flight",
) {
  if (section === "compare") return researchCategoryHref(tripId, researchCategory, { variantId });
  const query = variantId ? `?variant=${encodeURIComponent(variantId)}` : "";
  return `/trips/${tripId}${query}`;
}

export type PlanResearchContext = {
  category: ResearchCategory;
  dayId: string;
  itemId?: string;
  variantId: string;
};

export function parseResearchCategory(value?: string): ResearchCategory | undefined {
  return researchCategories.includes(value as ResearchCategory)
    ? (value as ResearchCategory)
    : undefined;
}

export function matchingPlanResearchItems(items: PlanResearchItem[], context: PlanResearchContext) {
  const categoryItems = items.filter((item) => item.category === context.category);
  const contextual = categoryItems.filter(
    (item) =>
      (context.itemId && item.itinerary_item_id === context.itemId) ||
      (item.day_id === context.dayId && !item.itinerary_item_id) ||
      (!item.day_id && !item.itinerary_item_id),
  );
  return contextual.length ? contextual : categoryItems;
}

export function compareHrefForPlanContext(tripId: string, context: PlanResearchContext) {
  return researchCategoryHref(tripId, context.category, {
    dayId: context.dayId,
    itemId: context.itemId,
    variantId: context.variantId,
  });
}
