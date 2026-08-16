import type { LongImageScope, PublicItinerary, PublicItineraryLink } from "../types";

export function longImageScopeFromPage(
  page: Pick<PublicItineraryLink, "longImageEndDayNumber" | "longImageStartDayNumber">,
): LongImageScope {
  return page.longImageStartDayNumber !== null && page.longImageEndDayNumber !== null
    ? {
        endDayNumber: page.longImageEndDayNumber,
        mode: "date_range",
        startDayNumber: page.longImageStartDayNumber,
      }
    : { mode: "entire_trip" };
}

export function scopePublicItinerary(
  itinerary: PublicItinerary,
  scope: LongImageScope,
): PublicItinerary {
  if (scope.mode === "entire_trip") return itinerary;

  const days = itinerary.days.filter(
    ({ dayNumber }) => dayNumber >= scope.startDayNumber && dayNumber <= scope.endDayNumber,
  );
  if (!days.length) throw new Error("The selected image date range is no longer available.");

  const dayNumbers = new Set(days.map(({ dayNumber }) => dayNumber));
  const citySequence = itinerary.citySequence.filter(({ dayNumber }) => dayNumbers.has(dayNumber));
  const coverCities = [
    ...new Set(
      citySequence.length
        ? citySequence.map(({ name }) => name)
        : days
            .flatMap((day) => day.localities ?? [day.primaryLocality ?? day.city])
            .filter(Boolean),
    ),
  ] as string[];

  return {
    ...itinerary,
    citySequence,
    days,
    metadata: {
      ...itinerary.metadata,
      coverCities,
    },
    savedRoutes: itinerary.savedRoutes.filter(({ dayNumber }) => dayNumbers.has(dayNumber)),
    trip: {
      ...itinerary.trip,
      dayCount: days.length,
      endDate: days.at(-1)?.date ?? null,
      startDate: days[0]?.date ?? null,
    },
  };
}

export function longImageScopeLabel(scope: LongImageScope, dayCount?: number) {
  if (scope.mode === "entire_trip") {
    if (!dayCount) return "Entire trip";
    return `Entire trip · ${dayCount} ${dayCount === 1 ? "day" : "days"}`;
  }
  return scope.startDayNumber === scope.endDayNumber
    ? `Day ${scope.startDayNumber}`
    : `Days ${scope.startDayNumber}–${scope.endDayNumber}`;
}

export function sameLongImageScope(left: LongImageScope, right: LongImageScope) {
  if (left.mode !== right.mode) return false;
  if (left.mode === "entire_trip" || right.mode === "entire_trip") return true;
  return left.startDayNumber === right.startDayNumber && left.endDayNumber === right.endDayNumber;
}
