import { revalidatePath } from "next/cache";

import { isDefaultTripTitle, tripTitleFromPlace } from "@/features/trips/create-defaults";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import { getTripRepository } from "@/platform/composition/server";

/** Replace only an untouched default title after the first place is saved. */
export async function nameTripAfterFirstPlace(tripId: string, snapshot: PlaceSnapshot) {
  const repository = getTripRepository();
  const trip = await repository.getById(tripId);
  if (!trip || !isDefaultTripTitle(trip.title)) return;

  const title = tripTitleFromPlace(snapshot);
  if (!title || title === trip.title) return;
  const renamed = await repository.renameIfTitle(tripId, trip.title, title);
  if (!renamed) return;
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
}
