import type { RouteLegMode } from "../../../features/routes/types";

import type { GoogleRouteTravelMode } from "./types";

const googleModes: Record<RouteLegMode, GoogleRouteTravelMode | null> = {
  bike: "BICYCLE",
  bus: "TRANSIT",
  cable_car: null,
  ferry: null,
  flight: null,
  motorcycle: null,
  other: null,
  rideshare: "DRIVE",
  self_driving: "DRIVE",
  shuttle: "TRANSIT",
  subway: "TRANSIT",
  taxi: "DRIVE",
  train: "TRANSIT",
  tram: "TRANSIT",
  walk: "WALK",
};

export function googleTravelMode(mode: RouteLegMode | string): GoogleRouteTravelMode | null {
  return Object.hasOwn(googleModes, mode) ? googleModes[mode as RouteLegMode] : null;
}
