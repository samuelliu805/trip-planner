import type { CreateResearchItemInput } from "./schema.ts";
import type { ResearchCategory, ResearchLink, ResearchSegment } from "./types.ts";
import { addIsoDateDays } from "./date-range.ts";
import type { ItineraryItem, PlannerDay } from "../itinerary/types.ts";

function details(item: ItineraryItem) {
  return (item.details ?? {}) as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function itemDate(item: ItineraryItem, days: PlannerDay[]) {
  return days.find(({ id }) => id === item.day_id)?.date ?? null;
}

function relatedBookingItems(item: ItineraryItem, days: PlannerDay[]) {
  const sourceId = text(details(item).researchSourceId);
  if (!sourceId) return [item];
  return days
    .flatMap(({ items }) => items)
    .filter((candidate) => text(details(candidate).researchSourceId) === sourceId);
}

function capturedLinks(items: ItineraryItem[]) {
  const links: ResearchLink[] = [];
  const seen = new Set<string>();
  for (const item of items)
    for (const link of [
      ...(item.links ?? []),
      ...(item.booking_url ? [{ label: "Booking", url: item.booking_url }] : []),
    ])
      if (!seen.has(link.url)) {
        links.push({ label: link.label, url: link.url });
        seen.add(link.url);
      }
  return links.slice(0, 12);
}

function capturedPrice(items: ItineraryItem[]) {
  const priced = items.filter((item) => item.price_amount !== null && item.price_currency !== null);
  const currency = priced[0]?.price_currency ?? null;
  if (!currency || priced.some((item) => item.price_currency !== currency))
    return { currency: null, totalPriceAmount: null };
  return {
    currency,
    totalPriceAmount:
      Math.round(priced.reduce((sum, item) => sum + (item.price_amount ?? 0), 0) * 100) / 100,
  };
}

function journeyCapture(items: ItineraryItem[], days: PlannerDay[]) {
  const sorted = [...items].sort((left, right) => {
    const leftIndex = Number(details(left).segmentIndex ?? Number.POSITIVE_INFINITY);
    const rightIndex = Number(details(right).segmentIndex ?? Number.POSITIVE_INFINITY);
    return (
      leftIndex - rightIndex ||
      left.sort_order - right.sort_order ||
      left.id.localeCompare(right.id)
    );
  });
  const segments = sorted.flatMap((candidate): ResearchSegment[] => {
    const value = details(candidate);
    const departureDate = text(value.departureDate) ?? itemDate(candidate, days);
    const origin = text(value.origin);
    const destination = text(value.destination);
    if (!departureDate || !origin || !destination) return [];
    return [
      {
        arrivalDate: text(value.arrivalDate),
        arrivalTime: text(value.arrivalTime) ?? candidate.end_time,
        departureDate,
        departureTime: candidate.start_time,
        destination,
        origin,
        serviceNumber: text(value.serviceNumber),
      },
    ];
  });
  const first = segments[0];
  const last = segments.at(-1);
  const roundTrip =
    segments.length === 2 &&
    first?.origin === last?.destination &&
    first.destination === last.origin;
  return {
    destinationPlaceId: text(details(sorted[0] ?? items[0]).destinationPlaceId),
    destinationText: first?.destination ?? text(details(items[0]).destination),
    endDate: segments.length > 1 ? (last?.arrivalDate ?? last?.departureDate ?? null) : null,
    endTime: first?.arrivalTime ?? null,
    journeyType: segments.length > 1 ? (roundTrip ? "round_trip" : "multi_city") : "one_way",
    originPlaceId: text(details(sorted[0] ?? items[0]).originPlaceId),
    originText: first?.origin ?? text(details(items[0]).origin),
    segments,
    startDate: first?.departureDate ?? itemDate(items[0], days),
    startTime: first?.departureTime ?? items[0].start_time,
  } as const;
}

export function capturePlanItemAsResearch({
  category,
  days,
  item,
  tripId,
}: {
  category: ResearchCategory;
  days: PlannerDay[];
  item: ItineraryItem;
  tripId: string;
}): CreateResearchItemInput {
  const related = relatedBookingItems(item, days);
  const links = capturedLinks(related);
  const price = capturedPrice(related);
  const itemDetails = details(item);
  const base: CreateResearchItemInput = {
    category,
    currency: price.currency,
    dayId: item.day_id,
    itemId: item.id,
    links,
    note: item.notes,
    sourceUrl: item.booking_url ?? links[0]?.url ?? null,
    title: item.title,
    totalPriceAmount: price.totalPriceAmount,
    tripId,
  };
  if (category === "flight" || category === "train")
    return { ...base, ...journeyCapture(related, days) };
  if (category === "stay") {
    const checkInDate = text(itemDetails.checkInDate) ?? itemDate(item, days);
    return {
      ...base,
      endDate: text(itemDetails.checkOutDate) ?? addIsoDateDays(checkInDate, 1),
      locationPlaceId: item.place_id,
      locationText:
        item.place?.formattedAddress ??
        text(itemDetails.address) ??
        item.place?.displayName ??
        item.title,
      startDate: checkInDate,
    };
  }

  const pickup = related.find((candidate) => text(details(candidate).action) === "pickup") ?? item;
  const rentalReturn = related.find((candidate) => text(details(candidate).action) === "return");
  return {
    ...base,
    destinationPlaceId: rentalReturn?.place_id,
    destinationText:
      (rentalReturn &&
        (rentalReturn.place?.formattedAddress ?? text(details(rentalReturn).address))) ??
      text(itemDetails.address),
    endDate: rentalReturn ? itemDate(rentalReturn, days) : null,
    endTime: rentalReturn?.start_time,
    originPlaceId: pickup.place_id,
    originText: pickup.place?.formattedAddress ?? text(details(pickup).address) ?? pickup.title,
    startDate: itemDate(pickup, days),
    startTime: pickup.start_time,
  };
}
