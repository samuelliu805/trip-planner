"use server";
import { updateTripSchema } from "./schema";
import { updateTrip } from "./update-trip-action";
import { getTripRepository } from "@/platform/composition/server";

export async function saveTripSettings(input: unknown) {
  const parsed = updateTripSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Check the trip settings." };
  const data = parsed.data;
  const form = new FormData();
  for (const [name, value] of Object.entries({
    trip_id: data.tripId,
    title: data.title,
    timezone: data.timezone,
    currency: data.currency,
    start_date: data.startDate,
    end_date: data.endDate,
    day_count: data.dayCount,
    expected_version: data.expectedVersion,
    expected_content_version: data.expectedContentVersion,
    operation_id: data.operationId,
  }))
    form.set(name, String(value));
  const result = await updateTrip({}, form);
  if (result.error) return { error: result.error, conflict: result.conflict };
  const trip = await getTripRepository().getById(data.tripId);
  return trip
    ? { data: trip }
    : { error: "The saved settings could not be confirmed. Retry the same operation." };
}
