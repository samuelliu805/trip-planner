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

export function currentPlanDateChange(dates: string[], plan: ResearchPlanSnapshot) {
  const existing = plan.days
    .map((day) => day.date)
    .filter((date): date is string => !!date)
    .sort();
  if (!dates.length) return null;
  const added = [...existing, ...dates].sort();
  const first = added[0];
  const last = added.at(-1)!;
  const end = existing.length
    ? last
    : [last, addIsoDateDays(first, plan.days.length - 1)!].sort().at(-1)!;
  return {
    before: existing.length ? ([existing[0], existing.at(-1)!] as const) : null,
    after: [first, end] as const,
  };
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
