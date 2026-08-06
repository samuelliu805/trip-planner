import type { PublicItineraryDay, PublicItineraryItem } from "./types";

type PublicItemGroup = "Car rental" | "Notes" | "Plans" | "Stay" | "Transport";

export function publicItemGroup(item: PublicItineraryItem): PublicItemGroup {
  if (["transport", "flight", "train"].includes(item.type)) return "Transport";
  if (item.type === "car_rental") return "Car rental";
  if (item.type === "hotel") return "Stay";
  if (item.type === "note") return "Notes";
  return "Plans";
}

export function orderedPublicItems(day: PublicItineraryDay) {
  return day.items.slice().sort((left, right) => left.sortOrder - right.sortOrder);
}

const transferTypes = new Set(["transport", "flight", "train"]);

export function isPublicTransfer(item: PublicItineraryItem) {
  return transferTypes.has(item.type);
}

type PublicJourneyGroupKind = "activity" | "car" | "meal" | "note" | "transport";
export type PublicJourneyGroup = {
  items: PublicItineraryItem[];
  kind: PublicJourneyGroupKind;
};

function publicJourneyKind(item: PublicItineraryItem): PublicJourneyGroupKind {
  if (isPublicTransfer(item)) return "transport";
  if (item.type === "car_rental") return "car";
  if (item.type === "meal") return "meal";
  if (item.type === "note") return "note";
  return "activity";
}

export function publicDayJourney(day: PublicItineraryDay) {
  const groups: PublicJourneyGroup[] = [];
  const stays: PublicItineraryItem[] = [];
  for (const item of orderedPublicItems(day)) {
    if (item.type === "location") continue;
    if (item.type === "hotel") stays.push(item);
    else {
      const kind = publicJourneyKind(item);
      const existing = groups.find((group) => group.kind === kind);
      if (existing) existing.items.push(item);
      else groups.push({ items: [item], kind });
    }
  }
  return { groups, stays };
}

function normalizedCityName(value?: string) {
  return value?.trim().toLocaleLowerCase().replace(/\s+/g, " ") ?? "";
}

export function samePublicCity(left: PublicItineraryItem, right: PublicItineraryItem) {
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
