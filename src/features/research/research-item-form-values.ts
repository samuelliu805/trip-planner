import type { PlaceSnapshot } from "@/lib/providers/places/types";

import { firstPresentIsoDate } from "./date-range.ts";
import { parseResearchLinks } from "./links.ts";
import type { ResearchCategory, ResearchItem } from "./types.ts";

type ProviderPlaceSnapshot = PlaceSnapshot;

function optional(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim() || null;
}

function optionalInteger(form: FormData, key: string) {
  const value = optional(form, key);
  return value === null ? null : Number(value);
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
        journeyIndex?: number;
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
  const markedOutbound = rawSegments.filter((segment) => segment.journeyIndex === 0);
  const midpointDestination =
    journeyType === "round_trip" &&
    rawSegments.length >= 4 &&
    rawSegments.length % 2 === 0 &&
    firstSegment?.origin === lastSegment?.destination
      ? rawSegments[rawSegments.length / 2 - 1]?.destination
      : undefined;
  const outboundDestination =
    markedOutbound.at(-1)?.destination ??
    midpointDestination ??
    item?.destination_text ??
    firstSegment?.destination;
  const returnDeparture =
    rawSegments.find((segment) => segment.journeyIndex === 1)?.departureDate ??
    (midpointDestination ? rawSegments[rawSegments.length / 2]?.departureDate : undefined);
  const firstDepartureDate = firstPresentIsoDate(
    firstSegment?.departureDate,
    optional(form, "startDate"),
  );
  const lastJourneyDate = firstPresentIsoDate(lastSegment?.arrivalDate, lastSegment?.departureDate);
  const originText = optional(form, "originText") ?? firstSegment?.origin;
  const returnToPickup = category === "rental" && optional(form, "returnToPickup") === "true";
  const originPlaceId = optional(form, "originPlaceId");
  const originPlaceSnapshot = optionalJson<ProviderPlaceSnapshot>(form, "originPlaceSnapshot");
  const destinationText = returnToPickup
    ? originText
    : (optional(form, "destinationText") ??
      (journeyType === "multi_city" ? lastSegment?.destination : outboundDestination));
  const destinationPlaceId = returnToPickup ? originPlaceId : optional(form, "destinationPlaceId");
  const destinationPlaceSnapshot = returnToPickup
    ? originPlaceSnapshot
    : optionalJson<ProviderPlaceSnapshot>(form, "destinationPlaceSnapshot");
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
    adultCount: optionalInteger(form, "adultCount"),
    category,
    childCount: optionalInteger(form, "childCount"),
    currency: hasPrice ? optional(form, "currency") : null,
    dayId: item?.day_id ?? context?.dayId,
    destinationPlaceId,
    destinationPlaceSnapshot,
    destinationText,
    endDate:
      journeyType && journeyType !== "one_way" && rawSegments.length >= 2
        ? journeyType === "round_trip"
          ? firstPresentIsoDate(
              returnDeparture,
              rawSegments.length > 2 ? item?.end_date : lastSegment?.departureDate,
              lastSegment?.departureDate,
            )
          : lastJourneyDate
        : optional(form, "endDate"),
    endTime: firstSegment?.arrivalTime ?? optional(form, "endTime"),
    itemId: item?.itinerary_item_id ?? context?.itemId,
    journeyType,
    links: parseResearchLinks(item?.links),
    locationPlaceId: optional(form, "locationPlaceId"),
    locationPlaceSnapshot: optionalJson<ProviderPlaceSnapshot>(form, "locationPlaceSnapshot"),
    locationText,
    note: optional(form, "note"),
    originPlaceId,
    originPlaceSnapshot,
    originText,
    roomCount: category === "stay" ? optionalInteger(form, "roomCount") : null,
    segments,
    sourceUrl: optional(form, "sourceUrl"),
    startDate: firstDepartureDate,
    startTime: firstSegment?.departureTime ?? optional(form, "startTime"),
    title: optional(form, "title") ?? automaticTitle,
    totalPriceAmount: hasPrice ? Number(price) : null,
    tripId,
  };
}
