import { researchCategories, type PlanResearchItem, type ResearchCategory } from "./types.ts";

export type TripSection = "plan" | "compare";

export function tripSectionHref(tripId: string, section: TripSection, variantId?: string) {
  const suffix = section === "compare" ? "/compare" : "";
  const query = variantId ? `?variant=${encodeURIComponent(variantId)}` : "";
  return `/trips/${tripId}${suffix}${query}`;
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
  const exactItems = context.itemId
    ? items.filter(
        (item) => item.itinerary_item_id === context.itemId && item.category === context.category,
      )
    : [];
  if (exactItems.length) return exactItems;
  return items.filter(
    (item) =>
      item.category === context.category &&
      item.day_id === context.dayId &&
      !item.itinerary_item_id,
  );
}

export function compareHrefForPlanContext(tripId: string, context: PlanResearchContext) {
  const params = new URLSearchParams({
    category: context.category,
    dayId: context.dayId,
    variant: context.variantId,
  });
  if (context.itemId) params.set("itemId", context.itemId);
  return `/trips/${tripId}/compare?${params.toString()}`;
}
