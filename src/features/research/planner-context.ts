import type { PlannerCategory } from "@/features/itinerary/components/planner-config";
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";

import type { ResearchCategory } from "./types";
import type { PlanResearchContext } from "./urls";

export function plannerResearchCategory(
  category?: PlannerCategory,
  item?: ItineraryItem,
): ResearchCategory | undefined {
  if (!category || category.id === "city") return undefined;
  const details = (item?.details ?? {}) as Record<string, unknown>;
  const mode = item?.type === "transport" ? String(details.mode ?? "") : item?.type;
  if (mode === "flight") return "flight";
  if (mode === "train") return "train";
  if (category.id === "hotel") return "stay";
  if (category.id === "car_rental") return "rental";
  return undefined;
}

export function planResearchContext(
  variantId: string,
  day?: PlannerDay,
  category?: PlannerCategory,
  item?: ItineraryItem,
): (PlanResearchContext & { label: string }) | undefined {
  const researchCategory = plannerResearchCategory(category, item);
  if (!day || !category || !researchCategory) return undefined;
  return {
    category: researchCategory,
    dayId: day.id,
    ...(item && { itemId: item.id }),
    label: item?.title ?? `Day ${day.day_number} · ${category.label}`,
    variantId,
  };
}
