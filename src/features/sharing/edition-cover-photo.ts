import { editionCoverDay, editionTownKey, editionTowns } from "./edition-destinations.ts";
import { publicGoogleCoverItem } from "./public-media-presentation.ts";
import { isPublicVisualAnchor, publicPhotoPriority } from "./public-photo-selection.ts";
import type { PublicItinerary } from "./types.ts";

/** Reuse an already-selected POI in the longest-stay town, then that town's saved city photo. */
export function editionCoverPhoto(itinerary: PublicItinerary) {
  if (!itinerary.settings.showPlacePhotos) return undefined;
  const coverDay = editionCoverDay(itinerary);
  if (!coverDay) return undefined;
  const town = editionTowns(coverDay)[0]?.toLocaleLowerCase();
  const country = editionTownKey(coverDay)?.split(":")[0];
  const days = itinerary.days.filter((day) => editionTownKey(day) === editionTownKey(coverDay));
  const anchors = days.flatMap((day) => {
    const item = day.photoSource
      ? day.items.find((item) => item.ref === day.photoSource?.ref)
      : publicGoogleCoverItem(day);
    if (
      !item ||
      !isPublicVisualAnchor(item) ||
      !item.place?.googlePlaceId ||
      (country && item.place.countryCode !== country) ||
      item.place.localityName?.trim().toLocaleLowerCase() !== town ||
      (!day.photoSource && !item.media?.some((media) => media.source === "google_place"))
    )
      return [];
    return [{ day, item, priority: publicPhotoPriority(item, day) }];
  });
  const best = anchors.sort((a, b) => a.priority - b.priority)[0];
  if (best)
    return {
      day: best.day,
      source: best.day.photoSource ?? {
        ref: best.item.ref,
        googlePlaceId: best.item.place!.googlePlaceId!,
        name: best.item.place!.displayName,
      },
    };
  const source = days.find(
    (day) => day.cityPhotoSource?.name.trim().toLocaleLowerCase() === town,
  )?.cityPhotoSource;
  return source ? { day: coverDay, source } : undefined;
}
