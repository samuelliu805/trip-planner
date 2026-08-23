import type { z } from "zod";

import { placeSnapshotSchema } from "@/features/itinerary/item-schema";

import { parseResearchLinks } from "./links";
import type { ResearchCategory, ResearchItem } from "./types";

type GooglePlaceSnapshot = z.input<typeof placeSnapshotSchema>;

function optional(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim() || null;
}

function optionalJson<Value>(form: FormData, key: string) {
  const value = optional(form, key);
  if (!value) return null;
  try {
    return JSON.parse(value) as Value;
  } catch {
    return null;
  }
}

export function researchDraftCanSave(form: FormData, category: ResearchCategory) {
  if (optional(form, "title") || optional(form, "sourceUrl") || optional(form, "note")) return true;
  if (category === "stay") return Boolean(optional(form, "locationText"));
  return Boolean(optional(form, "originText"));
}

export function researchItemInputFromForm({
  category,
  context,
  form,
  item,
  tripId,
}: {
  category: ResearchCategory;
  context?: { dayId?: string; itemId?: string };
  form: FormData;
  item?: ResearchItem;
  tripId: string;
}) {
  const price = optional(form, "totalPriceAmount");
  const hasPrice = price !== null;
  const rawSegments =
    (
      optionalJson(form, "segments") as Array<{
        arrivalDate?: string;
        arrivalTime?: string;
        carrier?: string;
        departureDate: string;
        departureTime?: string;
        destination: string;
        origin: string;
        serviceNumber?: string;
      }> | null
    )?.map((segment) => ({
      ...segment,
      arrivalDate: segment.arrivalDate || null,
      arrivalTime: segment.arrivalTime || null,
      carrier: segment.carrier || null,
      departureTime: segment.departureTime || null,
      serviceNumber: segment.serviceNumber || null,
    })) ?? [];
  const segments = rawSegments.filter(
    (segment) => segment.origin && segment.destination && segment.departureDate,
  );
  const firstSegment = rawSegments[0];
  const lastSegment = rawSegments.at(-1);
  const journeyType = optional(form, "journeyType") as
    "one_way" | "round_trip" | "multi_city" | null;
  const originText = firstSegment?.origin ?? optional(form, "originText");
  const returnToPickup = category === "rental" && optional(form, "returnToPickup") === "true";
  const originPlaceId = optional(form, "originPlaceId");
  const originPlaceSnapshot = optionalJson<GooglePlaceSnapshot>(form, "originPlaceSnapshot");
  const destinationText = returnToPickup
    ? originText
    : (firstSegment?.destination ?? optional(form, "destinationText"));
  const destinationPlaceId = returnToPickup ? originPlaceId : optional(form, "destinationPlaceId");
  const destinationPlaceSnapshot = returnToPickup
    ? originPlaceSnapshot
    : optionalJson<GooglePlaceSnapshot>(form, "destinationPlaceSnapshot");
  const locationText = optional(form, "locationText");
  const automaticTitle =
    category === "stay"
      ? locationText
      : originText
        ? destinationText && destinationText !== originText
          ? `${originText} → ${destinationText}`
          : originText
        : null;

  return {
    category,
    currency: hasPrice ? optional(form, "currency") : null,
    dayId: item?.day_id ?? context?.dayId,
    destinationPlaceId,
    destinationPlaceSnapshot,
    destinationText,
    endDate:
      journeyType && journeyType !== "one_way" && rawSegments.length >= 2
        ? (lastSegment?.arrivalDate ?? lastSegment?.departureDate ?? null)
        : optional(form, "endDate"),
    endTime: firstSegment?.arrivalTime ?? optional(form, "endTime"),
    itemId: item?.itinerary_item_id ?? context?.itemId,
    journeyType,
    links: parseResearchLinks(item?.links),
    locationPlaceId: optional(form, "locationPlaceId"),
    locationPlaceSnapshot: optionalJson<GooglePlaceSnapshot>(form, "locationPlaceSnapshot"),
    locationText,
    note: optional(form, "note"),
    originPlaceId,
    originPlaceSnapshot,
    originText,
    segments,
    sourceUrl: optional(form, "sourceUrl"),
    startDate: firstSegment?.departureDate ?? optional(form, "startDate"),
    startTime: firstSegment?.departureTime ?? optional(form, "startTime"),
    title: optional(form, "title") ?? automaticTitle,
    totalPriceAmount: hasPrice ? Number(price) : null,
    tripId,
  };
}
