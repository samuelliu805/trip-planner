import type { RouteLegMode } from "../../../../features/routes/types.ts";

export type AmapRouteMode = "bicycling" | "driving" | "walking";

const amapModes: Record<RouteLegMode, AmapRouteMode | null> = {
  bike: "bicycling",
  bus: null,
  cable_car: null,
  ferry: null,
  flight: null,
  motorcycle: null,
  other: null,
  rideshare: "driving",
  self_driving: "driving",
  shuttle: null,
  subway: null,
  taxi: "driving",
  train: null,
  tram: null,
  walk: "walking",
};

export function amapRouteMode(mode: RouteLegMode | string): AmapRouteMode | null {
  return Object.hasOwn(amapModes, mode) ? amapModes[mode as RouteLegMode] : null;
}
