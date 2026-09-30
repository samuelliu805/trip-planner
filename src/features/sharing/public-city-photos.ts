import { z } from "zod";
import type { PublicItinerary } from "./types.ts";
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
      const city = sources.find((source) => source.dayRef === day.ref);
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
      return { ...day, photoSource };
    }),
  };
}
