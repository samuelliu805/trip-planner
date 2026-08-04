import { format, parseISO } from "date-fns";

import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";

export type CityOccurrence = {
  address?: string;
  dayId: string;
  dayLabel: string;
  dayNumber: number;
  itemId: string;
  latitude: number;
  longitude: number;
  placeId: string;
  placeKey: string;
  sortOrder: number;
  title: string;
};

export type CityOrderCandidate = Pick<
  CityOccurrence,
  "dayId" | "itemId" | "placeKey" | "sortOrder" | "title"
>;

export type OrderedCitySourceDay = {
  cities: Array<{
    address?: string;
    itemId: string;
    latitude: number;
    longitude: number;
    placeId: string;
    placeKey: string;
    sortOrder: number;
    title: string;
  }>;
  dayId: string;
  dayLabel: string;
  dayNumber: number;
};

export function isValidMapCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function cityPlaceKey(item: ItineraryItem): string | null {
  if (!item.place) return null;
  return item.place.providerPlaceId
    ? `google:${item.place.providerPlaceId}`
    : `place:${item.place.id}`;
}

export function cityInputPlaceKey(
  days: PlannerDay[],
  placeId?: string | null,
  providerPlaceId?: string,
) {
  if (providerPlaceId) return `google:${providerPlaceId}`;
  if (!placeId) return null;
  const linkedItem = days.flatMap(({ items }) => items).find((item) => item.place?.id === placeId);
  return linkedItem ? cityPlaceKey(linkedItem) : `place:${placeId}`;
}

export function orderedCityOccurrencesFromDays(days: OrderedCitySourceDay[]): CityOccurrence[] {
  return [...days]
    .sort((a, b) => a.dayNumber - b.dayNumber || a.dayId.localeCompare(b.dayId))
    .flatMap((day) =>
      [...day.cities]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.itemId.localeCompare(b.itemId))
        .flatMap((city) => {
          if (!isValidMapCoordinate(city.latitude, city.longitude)) return [];
          return [
            {
              address: city.address,
              dayId: day.dayId,
              dayLabel: day.dayLabel,
              dayNumber: day.dayNumber,
              itemId: city.itemId,
              latitude: city.latitude,
              longitude: city.longitude,
              placeId: city.placeId,
              placeKey: city.placeKey,
              sortOrder: city.sortOrder,
              title: city.title,
            },
          ];
        }),
    );
}

export function orderedCityOccurrences(days: PlannerDay[]): CityOccurrence[] {
  return orderedCityOccurrencesFromDays(
    days.map((day) => ({
      cities: day.items.flatMap((item) => {
        const placeKey = item.type === "location" ? cityPlaceKey(item) : null;
        if (!item.place || !placeKey) return [];
        return [
          {
            address: item.place.formattedAddress,
            itemId: item.id,
            latitude: item.place.latitude,
            longitude: item.place.longitude,
            placeId: item.place.id,
            placeKey,
            sortOrder: item.sort_order,
            title: item.title,
          },
        ];
      }),
      dayId: day.id,
      dayLabel: day.date ? format(parseISO(day.date), "MMM d") : `Day ${day.day_number}`,
      dayNumber: day.day_number,
    })),
  );
}

export function neighboringCityConflict(occurrences: CityOccurrence[]) {
  for (let index = 1; index < occurrences.length; index += 1) {
    if (
      occurrences[index - 1].dayNumber === occurrences[index].dayNumber &&
      occurrences[index - 1].placeKey === occurrences[index].placeKey
    )
      return { from: occurrences[index - 1], to: occurrences[index] };
  }
  return null;
}

export function neighboringCityConflictAfterRemoving(
  days: PlannerDay[],
  removedItemIds: Iterable<string>,
) {
  const removed = new Set(removedItemIds);
  return neighboringCityConflict(
    orderedCityOccurrences(days).filter(({ itemId }) => !removed.has(itemId)),
  );
}

export function prospectiveNeighboringCityConflict(
  days: PlannerDay[],
  candidates: CityOrderCandidate[],
) {
  const candidateIds = new Set(candidates.map(({ itemId }) => itemId));
  const dayNumbers = new Map(days.map(({ day_number, id }) => [id, day_number]));
  const existing = orderedCityOccurrences(days).filter(({ itemId }) => !candidateIds.has(itemId));
  const additions = candidates.flatMap((candidate): CityOccurrence[] => {
    const dayNumber = dayNumbers.get(candidate.dayId);
    if (dayNumber === undefined) return [];
    return [
      {
        ...candidate,
        dayLabel: `Day ${dayNumber}`,
        dayNumber,
        latitude: 0,
        longitude: 0,
        placeId: candidate.placeKey,
      },
    ];
  });
  return neighboringCityConflict(
    [...existing, ...additions].sort(
      (a, b) =>
        a.dayNumber - b.dayNumber || a.sortOrder - b.sortOrder || a.itemId.localeCompare(b.itemId),
    ),
  );
}

export function neighboringCityError() {
  return "Choose a different City. Neighboring City items on the same day cannot use the same map place.";
}
