import { hasValidCoordinates } from "../../lib/providers/maps/types.ts";

import {
  eligibleRouteStopTypes,
  routeLegModes,
  type DayRouteDraft,
  type EligibleRouteStopType,
  type RouteLegMode,
} from "./types.ts";

export function isEligibleRouteStopType(value: string): value is EligibleRouteStopType {
  return eligibleRouteStopTypes.includes(value as EligibleRouteStopType);
}

export function isRouteLegMode(value: string): value is RouteLegMode {
  return routeLegModes.includes(value as RouteLegMode);
}

export function validateDayRouteDraft(draft: DayRouteDraft): string | null {
  if (draft.stops.length < 2 || draft.stops.length > 20) {
    return "A day route requires between 2 and 20 stop references.";
  }

  if (draft.legModes.length !== draft.stops.length - 1) {
    return "Leg mode count must equal stop count minus one.";
  }

  if (draft.legModes.some((mode) => !isRouteLegMode(mode))) {
    return "The route contains an invalid leg mode.";
  }

  if (
    draft.stops.some((stop) => stop.tripId !== draft.tripId || stop.variantId !== draft.variantId)
  ) {
    return "Every route stop must belong to the active route variant.";
  }

  if (
    draft.stops.some(
      (stop, index) =>
        stop.dayId !== draft.dayId &&
        !(
          index === 0 &&
          draft.previousDayId &&
          stop.dayId === draft.previousDayId &&
          stop.type === "hotel"
        ),
    )
  ) {
    return "Route stops must belong to this day, except the first stop may be the previous day Hotel.";
  }

  if (draft.stops.some((stop) => !isEligibleRouteStopType(stop.type))) {
    return "Only Activity, Meal, and Hotel items can be route stops.";
  }

  if (draft.stops.some((stop) => !stop.coordinates || !hasValidCoordinates(stop.coordinates))) {
    return "Every route stop needs a saved map place with valid coordinates.";
  }

  const positionsByItem = new Map<string, number[]>();
  draft.stops.forEach((stop, index) => {
    positionsByItem.set(stop.itemId, [...(positionsByItem.get(stop.itemId) ?? []), index]);
  });
  const duplicates = [...positionsByItem.entries()].filter(([, positions]) => positions.length > 1);

  if (duplicates.length > 1) {
    return "Only one Hotel may be repeated as the first and final stop.";
  }

  if (duplicates.length === 1) {
    const [itemId, positions] = duplicates[0];
    const repeatedStop = draft.stops.find((stop) => stop.itemId === itemId);
    if (
      positions.length !== 2 ||
      repeatedStop?.type !== "hotel" ||
      positions[0] !== 0 ||
      positions[1] !== draft.stops.length - 1
    ) {
      return "A repeated Hotel must appear exactly at the first and final positions.";
    }
  }

  const distinctLocations = new Set(
    draft.stops.map(
      ({ coordinates }) =>
        `${coordinates!.latitude.toFixed(7)},${coordinates!.longitude.toFixed(7)}`,
    ),
  );
  if (distinctLocations.size < 2) {
    return "A day route requires at least two distinct coordinate locations.";
  }

  return null;
}
