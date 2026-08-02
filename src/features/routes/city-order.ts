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

export function orderedCityOccurrences(days: PlannerDay[]): CityOccurrence[] {
  return [...days]
    .sort((a, b) => a.day_number - b.day_number)
    .flatMap((day) =>
      [...day.items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .flatMap((item) => {
          const placeKey = item.type === "location" ? cityPlaceKey(item) : null;
          if (!item.place || !placeKey) return [];
          return [
            {
              address: item.place.formattedAddress,
              dayId: day.id,
              dayLabel: day.date ? format(parseISO(day.date), "MMM d") : `Day ${day.day_number}`,
              dayNumber: day.day_number,
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
