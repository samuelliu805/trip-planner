import { revalidatePath } from "next/cache";

import { isDefaultTripTitle, tripTitleFromPlace } from "@/features/trips/create-defaults";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import type { createClient } from "@/lib/supabase/server";

/**
 * Creation asks for no name, so the first place written into the plan supplies one. A name the
 * traveller typed themselves is never touched, and a rename that fails never fails the save that
 * carried it — the trip simply keeps the dated name it was created with.
 */
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
    // Matching the old title keeps a rename racing with a manual edit from overwriting it.
    .eq("id", tripId)
    .eq("title", trip.title)
    .select("id")
    .maybeSingle();
  if (!renamed) return;
  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
}
