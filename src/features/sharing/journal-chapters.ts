import type { PublicItineraryDay } from "./types.ts";

/** Pick the richest three days globally; spread equally rich ties, then read chronologically. */
export function journalPreviewIndexes(days: PublicItineraryDay[]) {
  if (days.length <= 3) return days.map((_, index) => index);
  const candidates = days.map((day, index) => ({
    index,
    plans: day.items.filter((item) => item.type !== "location").length,
    activities: day.items.filter((item) => item.type === "activity").length,
  }));
  const chosen: number[] = [];
  const distance = (index: number) =>
    chosen.length
      ? Math.min(...chosen.map((selected) => Math.abs(index - selected)))
      : -Math.abs(index - (days.length - 1) / 2);
  while (chosen.length < 3) {
    candidates.sort(
      (a, b) =>
        b.plans - a.plans ||
        b.activities - a.activities ||
        distance(b.index) - distance(a.index) ||
        a.index - b.index,
    );
    chosen.push(candidates.shift()!.index);
  }
  return chosen.sort((a, b) => a - b);
}
