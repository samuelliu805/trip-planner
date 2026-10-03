import { isPublicTransfer, orderedPublicItems } from "./presentation.ts";
import { withPublicDayDepartureCities } from "./public-day-departures.ts";
import type { PublicItinerary, PublicItineraryDay, PublicItineraryItem } from "./types.ts";

export function meaningfulText(value?: string | null) {
  return value?.trim() ? value : undefined;
}

export function publicItemAttachments(item: PublicItineraryItem) {
  return (item.media ?? []).filter((media) => media.source === "attachment");
}

export function editorialDaySections(day: PublicItineraryDay) {
  const items = orderedPublicItems(day).filter(({ type }) => type !== "location");
  return {
    notes: items.filter(({ type }) => type === "note"),
    plans: items.filter((item) => item.type !== "note" && !isPublicTransfer(item)),
    transport: items.filter(isPublicTransfer),
  };
}

// A display projection, never a mutation of the owner's data or published snapshot.
export function publicDisplayItinerary(itinerary: PublicItinerary): PublicItinerary {
  return {
    ...itinerary,
    days: withPublicDayDepartureCities(itinerary).days.map((day) => ({
      ...day,
      cityPhotoSource: itinerary.settings.showPlacePhotos ? day.cityPhotoSource : undefined,
      photoSource: itinerary.settings.showPlacePhotos ? day.photoSource : undefined,
      notes: itinerary.settings.showNotes ? meaningfulText(day.notes) : undefined,
      items: day.items
        .filter((item) => itinerary.settings.showNotes || item.type !== "note")
        .map((item) => ({
          ...item,
          notes: itinerary.settings.showNotes ? meaningfulText(item.notes) : undefined,
          media: item.media?.filter((media) =>
            media.source === "attachment"
              ? itinerary.settings.showAttachments
              : itinerary.settings.showPlacePhotos === true,
          ),
        })),
    })),
  };
}
