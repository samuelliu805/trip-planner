import type { TripStatusFilter } from "@/features/trips/status";
import type { TripListEntry } from "@/features/trips/types";
import { getTripRepository } from "@/platform/composition/server";
import type { Tables } from "@/types/database";

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
    return { data: data as TripListEntry[], error: null };
  } catch (error) {
    return { data: null, error: repositoryError(error) };
  }
}

export async function getTrip(tripId: string) {
  try {
    const data = await getTripRepository().getById(tripId);
    return { data: data as Tables<"trips"> | null, error: null };
  } catch (error) {
    return { data: null, error: repositoryError(error) };
  }
}
