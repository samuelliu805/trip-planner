import { isPublicTransfer, orderedPublicItems, publicTransferItemLabel } from "./presentation.ts";
import { publicDayItemMedia } from "./public-media-presentation.ts";
import type { PublicItemMedia, PublicItineraryDay, PublicItineraryItem } from "./types";

export type PublicTimelineNodeKind = "destination" | "hotel_endpoint" | "rental_event";

export type PublicTimelineNodePresentation = {
  gutterLabel: string;
  item: PublicItineraryItem;
  kind: PublicTimelineNodeKind;
  media: PublicItemMedia[];
  ordinal: number;
};

const timelineNodeTypes = new Set(["activity", "meal", "hotel", "car_rental"]);

export function publicTimelineNodeLabel(item: PublicItineraryItem, ordinal: number) {
  return item.startTime?.slice(0, 5) ?? String(ordinal).padStart(2, "0");
}

export function publicTimelineTransportMeta(item: PublicItineraryItem) {
  const start = item.startTime?.slice(0, 5);
  const end = item.endTime?.slice(0, 5);
  const schedule = start ? (end && end !== start ? `${start}–${end}` : start) : item.scheduleLabel;
  return [schedule, item.place?.displayName]
    .filter((value, index, values): value is string =>
      Boolean(value && values.findIndex((entry) => entry === value) === index),
    )
    .join(" · ");
}

function timelineNodeKind(item: PublicItineraryItem): PublicTimelineNodeKind {
  if (item.type === "hotel") return "hotel_endpoint";
  if (item.type === "car_rental") return "rental_event";
  return "destination";
}

export function publicTimelineDayPresentation(day: PublicItineraryDay) {
  const ordered = orderedPublicItems(day).filter(({ type }) => type !== "location");
  const nodeItems = ordered.filter(({ type }) => timelineNodeTypes.has(type));
  const mediaByItem = publicDayItemMedia(day);

  const nodes: PublicTimelineNodePresentation[] = nodeItems.map((item, index) => ({
    gutterLabel: publicTimelineNodeLabel(item, index + 1),
    item,
    kind: timelineNodeKind(item),
    media: mediaByItem.get(item.ref) ?? [],
    ordinal: index + 1,
  }));

  return {
    nodes,
    notes: ordered.filter(({ type }) => type === "note"),
    transfers: ordered
      .filter(isPublicTransfer)
      .map((item) => ({ item, label: publicTransferItemLabel(item) })),
  };
}
