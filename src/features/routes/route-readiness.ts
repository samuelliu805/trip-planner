import type { ItineraryItem } from "../itinerary/types.ts";
import { hasValidCoordinates } from "../../lib/providers/maps/types.ts";

/** Matches the persisted route's coordinate precision before enabling calculation. */
export function canCalculateRouteStops(
  stops: Array<
    | { latitude?: number | null; longitude?: number | null; coordinateSystem?: "wgs84" }
    | null
    | undefined
  >,
): boolean {
  if (stops.length < 2 || stops.length > 20) return false;
  if (
    stops.some(
      (stop) =>
        !stop ||
        typeof stop.latitude !== "number" ||
        typeof stop.longitude !== "number" ||
        !hasValidCoordinates({ ...stop, latitude: stop.latitude, longitude: stop.longitude }),
    )
  )
    return false;
  return (
    new Set(stops.map((stop) => `${stop!.latitude!.toFixed(7)},${stop!.longitude!.toFixed(7)}`))
      .size >= 2
  );
}

export function canCalculateDayRouteDraft(
  draft: { itemIds: string[] } | null,
  items: ItineraryItem[],
) {
  const byId = new Map(items.map((item) => [item.id, item.place]));
  return canCalculateRouteStops((draft?.itemIds ?? []).map((id) => byId.get(id)));
}
