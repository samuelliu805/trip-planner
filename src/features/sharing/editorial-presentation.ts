import { isPublicTransfer, orderedPublicItems } from "./presentation.ts";
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
    plans: items.filter((item) => !isPublicTransfer(item)),
    transport: items.filter(isPublicTransfer),
  };
}

// A display projection, never a mutation of the owner's data or published snapshot.
export function publicDisplayItinerary(itinerary: PublicItinerary): PublicItinerary {
  return {
    ...itinerary,
    days: itinerary.days.map((day) => ({
      ...day,
      cityPhotoSource: itinerary.settings.showPlacePhotos ? day.cityPhotoSource : undefined,
      photoSource: itinerary.settings.showPlacePhotos ? day.photoSource : undefined,
      notes: itinerary.settings.showNotes ? meaningfulText(day.notes) : undefined,
      items: day.items.map((item) => ({
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
