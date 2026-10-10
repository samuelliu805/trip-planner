import type { RouteCalculationConfig } from "./types.ts";
import type { OverviewStage } from "./overview.ts";

// Provider-independent identities pin the configuration before a paid request starts.
export function dayRouteInputSnapshot(config: RouteCalculationConfig) {
  return JSON.stringify([
    config.tripId,
    config.variantId,
    config.dayId,
    config.stops.map((stop) => [
      stop.itemId,
      stop.coordinates.latitude.toFixed(7),
      stop.coordinates.longitude.toFixed(7),
    ]),
    config.legModes,
  ]);
}
export function overviewInputSnapshot(stages: OverviewStage[]) {
  return JSON.stringify(
    stages.map((stage) => [
      stage.placeId,
      stage.entries[0]?.itemId,
      stage.latitude.toFixed(7),
      stage.longitude.toFixed(7),
    ]),
  );
}
