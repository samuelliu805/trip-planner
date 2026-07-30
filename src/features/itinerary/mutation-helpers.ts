import type { ItineraryItem } from "./types";

export function normalizedOptional(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function normalizedTimes(startTime?: string | null, endTime?: string | null) {
  return { end_time: normalizedOptional(endTime), start_time: normalizedOptional(startTime) };
}

export function buildCopyRows(
  sources: ItineraryItem[],
  targetDayId: string,
  firstSortOrder: number,
  preservePlace: boolean,
  createId: () => string = () => crypto.randomUUID(),
) {
  return sources.map((source, index) => ({
    booking_url: source.booking_url,
    day_id: targetDayId,
    details: source.details,
    end_time: source.end_time,
    id: createId(),
    notes: source.notes,
    place_id: preservePlace ? source.place_id : null,
    sort_order: firstSortOrder + index,
    start_time: source.start_time,
    title: source.title,
    trip_id: source.trip_id,
    type: source.type,
    variant_id: source.variant_id,
  }));
}
