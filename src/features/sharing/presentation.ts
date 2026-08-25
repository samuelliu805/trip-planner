import type { PublicItineraryDay, PublicItineraryItem } from "./types";
import { transportModeLabels } from "../itinerary/types.ts";

export function orderedPublicItems(day: PublicItineraryDay) {
  return day.items.slice().sort((left, right) => left.sortOrder - right.sortOrder);
}

const transferTypes = new Set(["transport", "flight", "train"]);

export function isPublicTransfer(item: PublicItineraryItem) {
  return transferTypes.has(item.type);
}

function isPublicDestination(item: PublicItineraryItem) {
  return ["activity", "meal", "hotel"].includes(item.type);
}

function isPublicTravel(item: PublicItineraryItem) {
  return isPublicTransfer(item) || item.type === "car_rental";
}

function uniqueLabelParts(values: Array<string | undefined>) {
  return values.filter((value, index, entries): value is string =>
    Boolean(value && entries.findIndex((entry) => entry === value) === index),
  );
}

export function publicTransferItemLabel(item: PublicItineraryItem) {
  const time = item.startTime?.slice(0, 5) ?? item.scheduleLabel;
  return uniqueLabelParts([
    time,
    publicTransportSupportingTitle(item) || publicTransportShortLabel(item),
    publicTransportRouteLabel(item),
    item.transport?.serviceNumber,
    item.place?.displayName,
  ]).join(" · ");
}

export function publicTransportRouteLabel(item: PublicItineraryItem) {
  const origin = item.transport?.origin;
  const destination = item.transport?.destination;
  if (origin && destination) return `${origin} → ${destination}`;
  if (origin) return `From ${origin}`;
  if (destination) return `To ${destination}`;
  return "";
}

export function publicTransportShortLabel(item: PublicItineraryItem) {
  if (item.type === "flight") return "Flight";
  if (item.type === "train") return "Train";

  const normalizedTitle = item.title.trim().toLocaleLowerCase();
  return (
    Object.values(transportModeLabels).find(
      (label) => label.toLocaleLowerCase() === normalizedTitle,
    ) ?? "Transport"
  );
}

function normalizedTransportText(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function publicTransportSupportingTitle(item: PublicItineraryItem) {
  const title = item.title.trim();
  if (normalizedTransportText(title) === normalizedTransportText(publicTransportShortLabel(item))) {
    return "";
  }

  const origin = item.transport?.origin?.trim();
  const destination = item.transport?.destination?.trim();
  const normalizedTitle = normalizedTransportText(title);
  const repeatsStructuredRoute =
    origin &&
    destination &&
    normalizedTitle.includes(normalizedTransportText(origin)) &&
    normalizedTitle.includes(normalizedTransportText(destination));
  return repeatsStructuredRoute ? "" : title;
}

export function publicRentalItemLabel(item: PublicItineraryItem) {
  const time = item.startTime?.slice(0, 5) ?? item.scheduleLabel;
  const rentalAction = item.carRental?.action
    ? item.carRental.action === "pickup"
      ? "Rental car pickup"
      : "Rental car return"
    : "Rental car";
  const details = uniqueLabelParts([
    time,
    item.carRental?.company ?? item.title,
    item.place?.displayName,
  ]).join(" · ");
  return `${rentalAction}: ${details}`;
}

type PublicJourneyGroupKind = "activity" | "meal";
type PublicJourneyGroup = {
  items: PublicItineraryItem[];
  kind: PublicJourneyGroupKind;
};

function publicJourneyKind(item: PublicItineraryItem): PublicJourneyGroupKind {
  if (item.type === "meal") return "meal";
  return "activity";
}

export function publicDayJourney(day: PublicItineraryDay) {
  function grouped(items: PublicItineraryItem[]) {
    const groups: PublicJourneyGroup[] = [];
    for (const item of items) {
      const kind = publicJourneyKind(item);
      const previous = groups.at(-1);
      if (previous?.kind === kind) previous.items.push(item);
      else groups.push({ items: [item], kind });
    }
    return groups;
  }

  const ordered = orderedPublicItems(day).filter(({ type }) => type !== "location");
  const destinations = ordered.filter((item) => isPublicDestination(item) && item.type !== "hotel");
  const travel = ordered.filter(isPublicTravel);
  const notes = ordered.filter(({ type }) => type === "note");
  return {
    groups: grouped(destinations),
    notes,
    stays: ordered.filter(({ type }) => type === "hotel"),
    transport: travel,
  };
}

function normalizedCityName(value?: string) {
  return value?.trim().toLocaleLowerCase().replace(/\s+/g, " ") ?? "";
}

function samePublicCity(left: PublicItineraryItem, right: PublicItineraryItem) {
  const leftNames = new Set(
    [left.title, left.place?.displayName].map(normalizedCityName).filter(Boolean),
  );
  const sameName = [right.title, right.place?.displayName]
    .map(normalizedCityName)
    .some((name) => name && leftNames.has(name));
  const sameCoordinates =
    typeof left.place?.latitude === "number" &&
    typeof left.place.longitude === "number" &&
    left.place.latitude === right.place?.latitude &&
    left.place.longitude === right.place?.longitude;
  return sameName || sameCoordinates;
}

export function publicDayCitySequence(day: PublicItineraryDay) {
  if (day.localities?.length) return [...new Set(day.localities)];
  const cityItems = orderedPublicItems(day).filter((item) => item.type === "location");
  if (!cityItems.length) return day.city ? [day.city] : [];
  return cityItems
    .filter((item, index) => index === 0 || !samePublicCity(cityItems[index - 1], item))
    .map(({ title }) => title);
}

export function publicDayCityLabel(day: PublicItineraryDay, condensed = false) {
  const cities = publicDayCitySequence(day);
  if (!cities.length) return "";
  if (!condensed || cities.length <= 3) return cities.join(" → ");
  return `${cities[0]} → … → ${cities.at(-1)}`;
}

export function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const semanticActionLabels = new Set([
  "Booking",
  "Check in",
  "Directions",
  "Menu",
  "Open",
  "Ticket",
  "Tickets",
  "Website",
]);

export function actionLabel(value: string) {
  const normalized = value.trim();
  return semanticActionLabels.has(normalized) ? normalized : "Open";
}

export function formatDistance(meters?: number | null) {
  if (meters === null || meters === undefined) return null;
  return meters < 1_000 ? `${Math.round(meters)} m` : `${(meters / 1_000).toFixed(1)} km`;
}

export function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}
