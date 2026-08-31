import "server-only";

import { getBackendCapabilities, getRelationalDatabase } from "@/platform/composition/server";

import { publicItinerarySchema } from "./schema";
import { publicGoogleCoverItem } from "./public-media-presentation";
import type { PublicItinerary } from "./types";

export type PublicPlaceMediaSource = {
  itemRef: string;
  provider: "google";
  providerPlaceId: string;
};

export function publicPlaceMediaSources(itinerary: PublicItinerary): PublicPlaceMediaSource[] {
  if (itinerary.settings.showPlacePhotos !== true) return [];
  return itinerary.days.flatMap((day) => {
    const item = publicGoogleCoverItem(day);
    return item?.place?.googlePlaceId
      ? [
          {
            itemRef: item.ref,
            provider: "google" as const,
            providerPlaceId: item.place.googlePlaceId,
          },
        ]
      : [];
  });
}

export async function getPublicPlaceMediaSources(token: string): Promise<PublicPlaceMediaSource[]> {
  if (!getBackendCapabilities().signedUrls) return [];
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("get_public_itinerary_v4", {
    shared_token: token,
  });
  if (error) return [];
  const parsed = publicItinerarySchema.safeParse(data);
  return parsed.success ? publicPlaceMediaSources(parsed.data) : [];
}
