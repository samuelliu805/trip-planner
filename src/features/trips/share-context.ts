"use server";

import { getPlannerVariants } from "@/features/itinerary/data";
import type { PlannerVariant } from "@/features/itinerary/types";
import { listPublicItineraryLinks } from "@/features/sharing/data";
import type { PublicItineraryLink } from "@/features/sharing/types";
import { tripIdSchema } from "@/features/trips/schema";

export type TripShareContext = {
  links: PublicItineraryLink[];
  variants: PlannerVariant[];
};

/**
 * The Trips list opens Share without leaving the page, so its routes and existing shareable pages
 * are fetched only for the trip that was asked about. Loading them for every card would be N+1.
 */
export async function loadTripShareContext(
  tripId: string,
): Promise<TripShareContext | { error: string }> {
  if (!tripIdSchema.safeParse(tripId).success) return { error: "That trip could not be found." };

  const [variants, links] = await Promise.all([
    getPlannerVariants(tripId),
    listPublicItineraryLinks(tripId),
  ]);
  if (variants.error || !variants.data)
    return { error: variants.error ?? "This trip's routes could not be loaded." };
  if (links.error) return { error: links.error };
  return { links: links.data, variants: variants.data };
}
