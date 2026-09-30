import "server-only";

import { getBackendCapabilities, getRelationalDatabase } from "@/platform/composition/server";

import { publicItinerarySchema } from "./schema";
import { publicGoogleCoverItem } from "./public-media-presentation";
import type { PublicItinerary } from "./types";
import { publicCityPhotoSourcesSchema, withPublicCityPhotos } from "./public-city-photos";

export type PublicPlaceMediaSource = {
  itemRef: string;
  provider: "google";
  providerPlaceId: string;
};

export function publicPlaceMediaSources(itinerary: PublicItinerary): PublicPlaceMediaSource[] {
  if (itinerary.settings.showPlacePhotos !== true) return [];
  return itinerary.days.flatMap((day) => {
    const item = publicGoogleCoverItem(day);
    const source =
      day.photoSource ??
      (item?.place?.googlePlaceId
        ? { ref: item.ref, googlePlaceId: item.place.googlePlaceId }
        : undefined);
    return source
      ? [
          {
            itemRef: source.ref,
            provider: "google" as const,
            providerPlaceId: source.googlePlaceId,
          },
        ]
      : [];
  });
}

export async function getPublicPlaceMediaSources(token: string): Promise<PublicPlaceMediaSource[]> {
  if (!getBackendCapabilities().signedUrls) return [];
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("get_public_share_page_v3", {
    shared_token: token,
  });
  if (error) return [];
  const parsed = publicItinerarySchema.safeParse(data);
  if (!parsed.success || !parsed.data.settings.showPlacePhotos) return [];
  const current = await database.rpc("get_public_itinerary_v4", { shared_token: token });
  const permissions = publicItinerarySchema.safeParse(current.data);
  if (!permissions.success || !permissions.data.settings.showPlacePhotos) return [];
  const cities = await database.rpc("get_public_city_photo_sources_v1", { shared_token: token });
  const sources = publicCityPhotoSourcesSchema.safeParse(cities.data);
  const citiesByRef = new Map(
    (sources.success ? sources.data : []).map((source) => [source.ref, source.googlePlaceId]),
  );
  const currentItems = new Map(
    permissions.data.days.flatMap((day) =>
      day.items.map((item) => [item.ref, item.place?.googlePlaceId] as const),
    ),
  );
  return publicPlaceMediaSources(
    withPublicCityPhotos(parsed.data, sources.success ? sources.data : []),
  ).filter(
    (source) =>
      (citiesByRef.get(source.itemRef) ?? currentItems.get(source.itemRef)) ===
      source.providerPlaceId,
  );
}
