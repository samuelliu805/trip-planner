import type { PlannerDay, PlannerWorkspace } from "../itinerary/types";
import type { ResearchItem } from "./types";
import { addIsoDateDays } from "./date-range.ts";
import { ideaJourneyPreview } from "./idea-journey-preview.ts";

/** Match the existing booking calendar rules without removing occupied days optimistically. */
export function applicationCalendar(
  days: PlannerDay[],
  source: ResearchItem,
  workspace: PlannerWorkspace,
  options: { booking?: boolean; anchor?: number | null; keepExtraDays?: boolean },
) {
  const journeys = ideaJourneyPreview(source);
  const starts = journeys
    .map((journey) => journey.departureDate)
    .filter(Boolean)
    .sort();
  const ends = journeys
    .map((journey) => journey.arrivalDate)
    .filter(Boolean)
    .sort();
  const start = starts[0] || source.start_date;
  const end = ends.at(-1) || source.end_date || start;
  if (!start || !end || end < start) return [];
  const removed: string[] = [];
  const dated = days.every((day) => day.date);
  const authoritative =
    options.booking &&
    source.category === "flight" &&
    ["round_trip", "multi_city"].includes(
      source.journey_type ?? (source.end_date ? "round_trip" : "one_way"),
    );
  if (options.anchor || authoritative || (options.booking && !dated)) {
    const first = addIsoDateDays(start, 1 - (options.anchor ?? 1))!;
    days.forEach((day, index) => {
      day.date = addIsoDateDays(first, index);
    });
    if (authoritative && !options.keepExtraDays) {
      while (days.length > 1 && days.at(-1)!.date! > end) {
        const tail = days.at(-1)!;
        if (tail.items.length || workspace.routePlans.some((route) => route.day_id === tail.id))
          break;
        removed.push(days.pop()!.id);
      }
    }
  }
  if (!(options.booking || options.anchor) || !days.every((day) => day.date)) return removed;
  const first = days[0].date! < start ? days[0].date! : start;
  const last = days.at(-1)!.date! > end ? days.at(-1)!.date! : end;
  for (let date = first; date <= last && days.length < 366; date = addIsoDateDays(date, 1)!) {
    if (days.some((day) => day.date === date)) continue;
    days.push({
      ...days[0],
      id: crypto.randomUUID(),
      date,
      title: null,
      notes: null,
      version: 1,
      content_version: 1,
      items_version: 1,
      items: [],
    });
  }
  days.sort((a, b) => a.date!.localeCompare(b.date!));
  days.forEach((day, index) => {
    day.day_number = index + 1;
  });
  return removed;
}
