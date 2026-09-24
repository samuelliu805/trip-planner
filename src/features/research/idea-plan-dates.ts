import type { ResearchItem, ResearchPlanSnapshot, ResearchSegment } from "./types.ts";
import { addIsoDateDays } from "./date-range.ts";

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

/** Preview the calendar after the first journey is placed on the chosen Day. */
export function anchoredPlanDateChange(
  dates: string[],
  plan: ResearchPlanSnapshot,
  anchorDayNumber: number,
) {
  if (!dates.length) return null;
  const before = plan.days
    .map((day) => day.date)
    .filter((date): date is string => !!date)
    .sort();
  const range = newPlanDateRange(dates[0], anchorDayNumber, plan.days.length, dates);
  return range
    ? {
        before: before.length ? ([before[0], before.at(-1)!] as const) : null,
        after: [range.start, range.end] as const,
      }
    : null;
}

export function newPlanDateRange(
  departureDate: string,
  anchorDayNumber: number,
  dayCount: number,
  journeyDates: string[],
) {
  const start = addIsoDateDays(departureDate, 1 - anchorDayNumber);
  if (!start) return null;
  const lastJourney = [...journeyDates].sort().at(-1) ?? departureDate;
  const journeyLength =
    Math.round(
      (Date.parse(`${lastJourney}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
    ) + 1;
  return { start, end: addIsoDateDays(start, Math.max(dayCount, journeyLength) - 1)! };
}
