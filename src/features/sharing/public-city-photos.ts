import { z } from "zod";
import type { PublicItinerary } from "./types.ts";
import { editionTowns } from "./edition-destinations.ts";
import { publicGoogleCoverItem } from "./public-media-presentation.ts";

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

/** A city's first chapter uses its saved city; later chapters use a saved POI. */
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
      const photoSource =
        city && (!repeated || !poi)
          ? { ref: city.ref, googlePlaceId: city.googlePlaceId, name: city.name }
          : undefined;
      const cityPhotoSource = city
        ? { ref: city.ref, googlePlaceId: city.googlePlaceId, name: city.name }
        : undefined;
      return { ...day, photoSource, cityPhotoSource };
    }),
  };
}
