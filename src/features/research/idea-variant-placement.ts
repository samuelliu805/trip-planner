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

export function initialIdeaVariantPlacement(
  item: ResearchItem,
  plan: ResearchPlanSnapshot,
): IdeaVariantPlacement {
  const placement = emptyIdeaVariantPlacement();
  if (item.category === "flight") return placement;
  const dates = ideaJourneyDates(item);
  const day = plan.days.find((entry) => entry.date && entry.date === (dates[0] ?? item.start_date));
  return day
    ? { ...placement, dayId: day.id, anchorDayNumber: dates.length ? day.dayNumber : null }
    : placement;
}

export function ideaOrderCandidates(
  item: ResearchItem,
  day?: ResearchPlanSnapshot["days"][number],
) {
  if (item.category !== "activity" || item.start_time) return [];
  return (day?.items ?? []).filter(
    (entry) =>
      (entry.type === "activity" || entry.type === "meal") &&
      !(
        entry.details &&
        typeof entry.details === "object" &&
        "flightEndpointParentId" in entry.details
      ),
  );
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
