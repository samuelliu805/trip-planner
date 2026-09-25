import type { ItineraryItem } from "./types";

export function normalizedOptional(value?: string | null) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

export function normalizedTimes(startTime?: string | null, endTime?: string | null) {
  return { end_time: normalizedOptional(endTime), start_time: normalizedOptional(startTime) };
}

export function hasDifferentJourneyDates(type: string, details: unknown) {
  if (!["flight", "train", "transport"].includes(type) || !details || typeof details !== "object")
    return false;
  const { departureDate, arrivalDate } = details as Record<string, unknown>;
  return (
    typeof departureDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(departureDate) &&
    typeof arrivalDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(arrivalDate) &&
    departureDate !== arrivalDate
  );
}

// The SQL schedule columns describe a single day. Multi-day arrival times remain in details.
export function normalizedScheduleEndTime(
  type: string,
  details: unknown,
  startTime?: string | null,
  endTime?: string | null,
) {
  return startTime && !hasDifferentJourneyDates(type, details) ? normalizedOptional(endTime) : null;
}

export function scheduleKind(startTime?: string | null, endTime?: string | null) {
  if (startTime && endTime) return "range" as const;
  if (startTime || endTime) return "exact" as const;
  return "none" as const;
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
    schedule_kind: source.schedule_kind,
    schedule_text: source.schedule_text,
    sort_order: firstSortOrder + index,
    start_time: source.start_time,
    title: source.title,
    trip_id: source.trip_id,
    type: source.type,
    variant_id: source.variant_id,
  }));
}
