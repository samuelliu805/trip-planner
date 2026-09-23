import type { ResearchItem, ResearchPlanSnapshot, ResearchSegment } from "./types.ts";

/** The date of each journey, rather than the overall return or arrival date. */
export function ideaJourneyDates(
  item: Pick<ResearchItem, "category" | "segments" | "journey_type" | "start_date" | "end_date">,
) {
  if (item.category !== "flight" && item.category !== "train") return [];
  const segments = Array.isArray(item.segments) ? (item.segments as ResearchSegment[]) : [];
  const seenJourneys = new Set<number>();
  const dates = segments
    .filter((segment, index) => {
      const journey = segment.journeyIndex ?? (item.journey_type === "multi_city" ? index : 0);
      if (seenJourneys.has(journey)) return false;
      seenJourneys.add(journey);
      return true;
    })
    .map((segment) => segment.departureDate)
    .filter(Boolean);
  if (!dates.length) {
    if (item.start_date) dates.push(item.start_date);
  }
  if (item.journey_type === "round_trip" && item.end_date && !dates.includes(item.end_date))
    dates.push(item.end_date);
  return [...new Set(dates)].sort();
}

export function missingJourneyDates(item: ResearchItem, plan: ResearchPlanSnapshot) {
  const planDates = new Set(plan.days.map((day) => day.date));
  return ideaJourneyDates(item).filter((date) => !planDates.has(date));
}
