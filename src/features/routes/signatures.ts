import type { Coordinates } from "../../lib/providers/maps/types.ts";
import type { MapsProviderId } from "../../lib/providers/maps/provider.ts";

import type { RouteCalculationConfig, RouteLegMode } from "./types.ts";

function stableHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x1b873593;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

export function normalizedCoordinateSignature(coordinates: Coordinates): string {
  return `${coordinates.latitude.toFixed(7)},${coordinates.longitude.toFixed(7)}`;
}

export function buildRouteLegSignature(
  config: Pick<RouteCalculationConfig, "dayId" | "tripId" | "variantId">,
  position: number,
  from: RouteCalculationConfig["stops"][number],
  to: RouteCalculationConfig["stops"][number],
  mode: RouteLegMode,
  providerId: MapsProviderId,
): string {
  return `leg-v2-${stableHash(
    JSON.stringify({
      dayId: config.dayId,
      from: {
        coordinates: normalizedCoordinateSignature(from.coordinates),
        itemId: from.itemId,
        occurrence: position,
      },
      mode,
      position,
      providerId,
      to: {
        coordinates: normalizedCoordinateSignature(to.coordinates),
        itemId: to.itemId,
        occurrence: position + 1,
      },
      tripId: config.tripId,
      variantId: config.variantId,
    }),
  )}`;
}

export function buildRouteConfigSignature(
  config: RouteCalculationConfig,
  providerId: MapsProviderId,
): string {
  return `route-v2-${stableHash(
    JSON.stringify({
      dayId: config.dayId,
      legs: config.legModes.map((mode, index) => ({
        mode,
        position: index + 1,
      })),
      providerId,
      stops: config.stops.map((stop, index) => ({
        coordinates: normalizedCoordinateSignature(stop.coordinates),
        itemId: stop.itemId,
        occurrence: index + 1,
      })),
      tripId: config.tripId,
      variantId: config.variantId,
    }),
  )}`;
}
