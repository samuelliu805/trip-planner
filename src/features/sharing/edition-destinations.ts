import { orderedPublicItems } from "./presentation.ts";
import type { PublicItinerary, PublicItineraryDay } from "./types.ts";

/** Destination names come from saved locality data, never individual stop titles. */
export function editionTowns(day: PublicItineraryDay) {
  const saved = orderedPublicItems(day).flatMap((item) => {
    const name = item.place?.localityName?.trim();
    return name ? [name] : [];
  });
  const names = saved.length ? saved : [day.primaryLocality?.trim()];
  return [...new Set(names.filter((name): name is string => Boolean(name)))];
}

export function editionTripTowns(itinerary: PublicItinerary) {
  return [...new Set(itinerary.days.flatMap(editionTowns))];
}

/** Count distinct published days, with first occurrence as a stable tie breaker. */
export function editionCoverDay(itinerary: PublicItinerary) {
  const towns = new Map<string, { count: number; day: PublicItineraryDay }>();
  for (const day of itinerary.days) {
    const town = (day.primaryLocality || editionTowns(day)[0] || "").trim().toLocaleLowerCase();
    if (!town) continue;
    const existing = towns.get(town);
    if (existing) existing.count++;
    else towns.set(town, { count: 1, day });
  }
  return [...towns.values()].sort((a, b) => b.count - a.count)[0]?.day ?? itinerary.days[0];
}
