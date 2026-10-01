import type { PublicItineraryDay } from "./types.ts";

/** One activity-rich chapter from each chronological third, in itinerary order. */
export function journalPreviewIndexes(days: PublicItineraryDay[]) {
  if (days.length <= 3) return days.map((_, index) => index);
  const candidates = days.map((day, index) => ({
    index,
    activities: day.items.filter((item) => item.type === "activity").length,
  }));
  const chosen: number[] = [];
  for (let segment = 0; segment < 3; segment++) {
    const start = Math.floor((days.length * segment) / 3);
    const end = Math.floor((days.length * (segment + 1)) / 3);
    const target = (start + end - 1) / 2;
    const candidate = candidates
      .filter(({ index }) => index >= start && index < end)
      .sort(
        (a, b) =>
          b.activities - a.activities ||
          Math.abs(a.index - target) - Math.abs(b.index - target) ||
          a.index - b.index,
      )[0];
    chosen.push(candidate.index);
  }
  return chosen.sort((a, b) => a - b);
}
