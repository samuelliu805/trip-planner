import { z } from "zod";
import type { PublicItinerary } from "./types.ts";
import { editionTowns } from "./edition-destinations.ts";
import { publicGoogleCoverItem } from "./public-media-presentation.ts";
import { publicTownVisualAnchor } from "./public-photo-selection.ts";

export const publicCityPhotoSourcesSchema = z.array(
  z
    .object({
      dayRef: z.string().length(64),
      ref: z.string().length(64),
      googlePlaceId: z.string().trim().min(1).max(300),
      name: z.string().min(1).max(300),
    })
    .strict(),
);

/** Prefer an existing visual anchor in the overnight town, retaining the saved city fallback. */
export function withPublicCityPhotos(
  itinerary: PublicItinerary,
  sources: z.infer<typeof publicCityPhotoSourcesSchema>,
): PublicItinerary {
  if (!itinerary.settings.showPlacePhotos) return itinerary;
  const cities = new Set<string>();
  return {
    ...itinerary,
    days: itinerary.days.map((day) => {
      const town = editionTowns(day)[0]?.toLocaleLowerCase();
      const savedCity = day.items.find(
        (item) =>
          ["location", "hotel"].includes(item.type) &&
          item.place?.googlePlaceId &&
          item.place.localityName?.trim().toLocaleLowerCase() === town &&
          item.place.displayName.trim().toLocaleLowerCase() === town,
      );
      // Existing itineraries also save the city itself as accommodation. Use the
      // published item, keeping the same current-item permission check in the API.
      const city =
        sources.find((source) => source.dayRef === day.ref) ??
        (savedCity?.place?.googlePlaceId
          ? {
              ref: savedCity.ref,
              googlePlaceId: savedCity.place.googlePlaceId,
              name: savedCity.place.displayName,
            }
          : undefined);
      const label = (day.primaryLocality || day.city || city?.name || "")
        .trim()
        .toLocaleLowerCase();
      const repeated = Boolean(label && cities.has(label));
      if (label) cities.add(label);
      const poi = publicGoogleCoverItem(day);
      const anchor = publicTownVisualAnchor(day, town);
      const photoSource = anchor?.place?.googlePlaceId
        ? {
            ref: anchor.ref,
            googlePlaceId: anchor.place.googlePlaceId,
            name: anchor.place.displayName,
          }
        : city && (!repeated || !poi)
          ? { ref: city.ref, googlePlaceId: city.googlePlaceId, name: city.name }
          : undefined;
      const cityPhotoSource = city
        ? { ref: city.ref, googlePlaceId: city.googlePlaceId, name: city.name }
        : undefined;
      return { ...day, photoSource, cityPhotoSource };
    }),
  };
}
