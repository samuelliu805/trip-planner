import type { PublicItineraryDay } from "./types.ts";

/** Tease three activity-rich chapters, retaining itinerary order and spreading tied choices. */
export function journalPreviewIndexes(days: PublicItineraryDay[]) {
  if (days.length <= 3) return days.map((_, index) => index);
  const candidates = days.map((day, index) => ({
    index,
    activities: day.items.filter((item) => item.type === "activity").length,
  }));
  const chosen: number[] = [];
  for (const fraction of [0.2, 0.5, 0.8]) {
    const target = (days.length - 1) * fraction;
    const candidate = candidates
      .filter(({ index }) => !chosen.includes(index))
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
