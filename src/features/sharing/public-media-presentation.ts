import { orderedPublicItems } from "./presentation.ts";
import type { PublicItemMedia, PublicItineraryDay, PublicItineraryItem } from "./types.ts";

function googleCoverPriority(item: PublicItineraryItem) {
  if (item.type === "activity" && !item.startTime && !item.scheduleLabel) return 0;
  if (item.type === "activity") return 1;
  if (item.type === "hotel") return 2;
  if (item.type === "meal") return 3;
  if (item.type === "car_rental") return 4;
  return 5;
}

function mediaPriority(media: PublicItemMedia) {
  return media.source === "attachment" ? 0 : 1;
}

export function orderedPublicItemMedia(item: PublicItineraryItem) {
  return (item.media ?? [])
    .map((media, index) => ({ index, media }))
    .sort(
      (left, right) =>
        mediaPriority(left.media) - mediaPriority(right.media) || left.index - right.index,
    )
    .map(({ media }) => media);
}

export function publicGoogleCoverItem(day: PublicItineraryDay) {
  return orderedPublicItems(day)
    .filter(({ place, type }) => type !== "location" && Boolean(place?.googlePlaceId))
    .map((item, index) => ({ index, item, priority: googleCoverPriority(item) }))
    .sort((left, right) => left.priority - right.priority || left.index - right.index)[0]?.item;
}

export function publicDayItemMedia(day: PublicItineraryDay) {
  const ordered = orderedPublicItems(day).filter(({ type }) => type !== "location");
  const googleCandidates = ordered.flatMap((item, itemIndex) =>
    orderedPublicItemMedia(item).flatMap((media, mediaIndex) =>
      media.kind === "image" && media.source === "google_place"
        ? [
            {
              item,
              itemIndex,
              media,
              mediaIndex,
              priority: googleCoverPriority(item),
            },
          ]
        : [],
    ),
  );
  const cover = googleCandidates.sort(
    (left, right) =>
      left.priority - right.priority ||
      left.itemIndex - right.itemIndex ||
      left.mediaIndex - right.mediaIndex,
  )[0];

  return new Map(
    ordered.flatMap((item) => {
      const media = orderedPublicItemMedia(item).filter(
        (entry) =>
          entry.source === "attachment" ||
          (item.ref === cover?.item.ref && entry.id === cover.media.id),
      );
      return media.length ? [[item.ref, media] as const] : [];
    }),
  );
}
