import { revalidatePath } from "next/cache";

import { isDefaultTripTitle, tripTitleFromPlace } from "@/features/trips/create-defaults";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import type { createClient } from "@/lib/supabase/server";

/** Replace only an untouched default title after the first place is saved. */
export async function nameTripAfterFirstPlace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  snapshot: PlaceSnapshot,
) {
  const { data: trip } = await supabase
    .from("trips")
    .select("title")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip || !isDefaultTripTitle(trip.title)) return;

  const title = tripTitleFromPlace(snapshot);
  if (!title || title === trip.title) return;
  const { data: renamed } = await supabase
    .from("trips")
    .update({ title })
    .eq("id", tripId)
    .eq("title", trip.title)
    .select("id")
    .maybeSingle();
  if (!renamed) return;
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
}
