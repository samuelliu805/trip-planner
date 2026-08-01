import { createHash } from "node:crypto";

import type { RouteTravelMode, RouteWaypoint } from "@/lib/providers/routes/types";

export function normalizedCoordinate(value: number) {
  return value.toFixed(6);
}

export function waypointSignature(input: {
  dayId: string;
  variantId: string;
  travelMode: RouteTravelMode;
  waypoints: RouteWaypoint[];
}) {
  const canonical = [
    input.dayId,
    input.variantId,
    input.travelMode,
    ...input.waypoints.map(
      (point) =>
        `${point.itemId}:${normalizedCoordinate(point.latitude)},${normalizedCoordinate(point.longitude)}`,
    ),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}
