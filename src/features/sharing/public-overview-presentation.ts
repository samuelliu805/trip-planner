import { orderedPublicItems } from "./presentation.ts";
import { orderedPublicItemMedia, publicDayItemMedia } from "./public-media-presentation.ts";
import type { PublicItemMedia, PublicItineraryDay, PublicItineraryItem } from "./types";

type PublicOverviewItemSize = "compact" | "media" | "rich";

export type PublicOverviewItemPresentation = {
  featured: boolean;
  item: PublicItineraryItem;
  media: PublicItemMedia[];
  remainingMediaCount: number;
  size: PublicOverviewItemSize;
};

export type PositionedPublicOverviewItemPresentation = PublicOverviewItemPresentation & {
  order: number;
};

const publicOverviewTransportTypes = new Set(["flight", "train", "transport"]);

export function publicOverviewItemPresentation(
  item: PublicItineraryItem,
  media = orderedPublicItemMedia(item),
): Omit<PublicOverviewItemPresentation, "featured"> {
  return {
    item,
    media,
    remainingMediaCount: Math.max(0, media.length - 3),
    size: media.length > 1 ? "rich" : media.length === 1 ? "media" : "compact",
  };
}

export function publicOverviewDayLayout(day: PublicItineraryDay) {
  let featured = false;
  const mediaByItem = publicDayItemMedia(day);
  return orderedPublicItems(day)
    .filter(({ type }) => type !== "location")
    .map((item) => {
      const presentation = publicOverviewItemPresentation(item, mediaByItem.get(item.ref) ?? []);
      const useFeature = !featured && presentation.media.some(({ kind }) => kind === "image");
      if (useFeature) featured = true;
      return { ...presentation, featured: useFeature };
    });
}

export function publicOverviewDaySections(day: PublicItineraryDay) {
  const positioned = publicOverviewDayLayout(day).map((presentation, index) => ({
    ...presentation,
    order: index + 1,
  }));

  return {
    cards: positioned.filter(({ item }) => !publicOverviewTransportTypes.has(item.type)),
    transport: positioned.filter(({ item }) => publicOverviewTransportTypes.has(item.type)),
  };
}
