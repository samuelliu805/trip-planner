import { ideaJourneyDates } from "./idea-plan-dates.ts";
import type { ResearchItem, ResearchPlanSnapshot } from "./types.ts";

export type IdeaVariantPlacement = {
  anchorDayNumber: number | null;
  beforeItemId: string;
  dayId: string;
};

export function emptyIdeaVariantPlacement(): IdeaVariantPlacement {
  return { anchorDayNumber: null, beforeItemId: "", dayId: "" };
}

export function placementRequired(item: ResearchItem, plan: ResearchPlanSnapshot) {
  const matchingDay = item.start_date
    ? plan.days.find((entry) => entry.date === item.start_date)
    : undefined;
  return (
    item.category === "activity" ||
    (item.category !== "flight" &&
      item.category !== "train" &&
      Boolean(item.start_date && !matchingDay))
  );
}

export function placementReady(
  item: ResearchItem,
  plan: ResearchPlanSnapshot,
  placement: IdeaVariantPlacement,
) {
  return ideaJourneyDates(item).length
    ? Boolean(placement.anchorDayNumber)
    : !placementRequired(item, plan) || Boolean(placement.dayId);
}
