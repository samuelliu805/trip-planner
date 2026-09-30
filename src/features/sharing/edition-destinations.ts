import { orderedPublicItems } from "./presentation.ts";
import type { PublicItinerary, PublicItineraryDay } from "./types.ts";

/** Prefer the overnight town; airport and activity titles are never destinations. */
export function editionTowns(day: PublicItineraryDay) {
  const items = orderedPublicItems(day);
  const overnight = items
    .filter((item) => item.type === "hotel")
    .map((item) => item.place?.localityName?.trim())
    .filter((name): name is string => Boolean(name));
  const town =
    overnight.at(-1) ||
    day.primaryLocality?.trim() ||
    items
      .find((item) => item.type === "location" && item.place?.localityName)
      ?.place?.localityName?.trim();
  return town ? [town] : [];
}

export function editionTownKey(day: PublicItineraryDay) {
  const town = editionTowns(day)[0];
  const place =
    orderedPublicItems(day).find(
      (item) => item.type === "hotel" && item.place?.localityName === town,
    )?.place ?? orderedPublicItems(day).find((item) => item.place?.localityName === town)?.place;
  return town ? `${place?.countryCode ?? ""}:${town.toLocaleLowerCase()}` : undefined;
}

export function editionTripTowns(itinerary: PublicItinerary) {
  let previous: string | undefined;
  return itinerary.days.flatMap((day) => {
    const key = editionTownKey(day);
    if (!key || key === previous) return [];
    previous = key;
    return editionTowns(day);
  });
}

/** Count overnight days, preserving first occurrence on ties. */
export function editionCoverDay(itinerary: PublicItinerary) {
  const towns = new Map<string, { count: number; day: PublicItineraryDay }>();
  for (const day of itinerary.days) {
    const town = editionTownKey(day);
    if (!town) continue;
    const existing = towns.get(town);
    if (existing) existing.count++;
    else towns.set(town, { count: 1, day });
  }
  return [...towns.values()].sort((a, b) => b.count - a.count)[0]?.day ?? itinerary.days[0];
}
