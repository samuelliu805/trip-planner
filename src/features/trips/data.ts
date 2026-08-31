import type { TripStatusFilter } from "@/features/trips/status";
import type { TripListEntry } from "@/features/trips/types";
import { getTripRepository } from "@/platform/composition/server";

function repositoryError(error: unknown) {
  return {
    message: error instanceof Error ? error.message : "The trip repository is unavailable.",
  };
}

export async function listTrips(filter: TripStatusFilter = "open") {
  try {
    const data = await getTripRepository().listForCurrentUser({
      status: filter === "all" ? undefined : filter,
    });
    const trips: TripListEntry[] = data.map((trip) => ({
      ...trip,
      route_variants: trip.route_variants ?? [],
    }));
    return { data: trips, error: null };
  } catch (error) {
    return { data: null, error: repositoryError(error) };
  }
}

export async function getTrip(tripId: string) {
  try {
    const data = await getTripRepository().getById(tripId);
    return { data, error: null };
  } catch (error) {
    return { data: null, error: repositoryError(error) };
  }
}
