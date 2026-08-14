import "server-only";

import { createClient } from "@/lib/supabase/server";

import { publicItinerarySchema } from "./schema";
import { publicGoogleCoverItem } from "./public-media-presentation";
import type { PublicItinerary } from "./types";

export type PublicPlaceMediaSource = {
  itemRef: string;
  providerPlaceId: string;
};

export function publicPlaceMediaSources(itinerary: PublicItinerary): PublicPlaceMediaSource[] {
  if (itinerary.settings.showPlacePhotos !== true) return [];
  return itinerary.days.flatMap((day) => {
    const item = publicGoogleCoverItem(day);
    return item?.place?.googlePlaceId
      ? [{ itemRef: item.ref, providerPlaceId: item.place.googlePlaceId }]
      : [];
  });
}

export async function getPublicPlaceMediaSources(token: string): Promise<PublicPlaceMediaSource[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_itinerary_v4", {
    shared_token: token,
  });
  if (error) return [];
  const parsed = publicItinerarySchema.safeParse(data);
  return parsed.success ? publicPlaceMediaSources(parsed.data) : [];
}
