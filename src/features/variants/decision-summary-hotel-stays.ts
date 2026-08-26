import type { HotelOccurrence } from "./decision-summary-types.ts";

export type HotelStay = { end: HotelOccurrence; start: HotelOccurrence; title: string };

export function consecutiveHotelStays(occurrences: HotelOccurrence[]): HotelStay[] {
  return occurrences.reduce<HotelStay[]>((stays, occurrence) => {
    const previous = stays.at(-1);
    if (
      previous?.end.identity === occurrence.identity &&
      occurrence.dayNumber === previous.end.dayNumber + 1
    ) {
      return [...stays.slice(0, -1), { ...previous, end: occurrence }];
    }
    return [...stays, { end: occurrence, start: occurrence, title: occurrence.title }];
  }, []);
}
