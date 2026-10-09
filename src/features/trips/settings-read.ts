import type { Trip } from "@/platform/contracts/trips";

export async function loadLatestTripSettings(tripId: string): Promise<Trip> {
  const response = await fetch(`/api/trips/${tripId}/settings`, { cache: "no-store" });
  if (!response.ok) throw new Error("Latest trip settings could not be loaded.");
  return ((await response.json()) as { trip: Trip }).trip;
}
