import type { Coordinates } from "../maps/types";

import type { RouteLegMode } from "../../../features/routes/types";

export type GoogleRouteTravelMode = "WALK" | "DRIVE" | "TRANSIT" | "BICYCLE";

export type RouteLegWarningCode =
  "unsupported_mode" | "no_route" | "walking_safety" | "bicycle_safety";

export type RouteLegWarning = {
  code: RouteLegWarningCode;
  message: string;
};

export type RouteLegRequest = {
  destination: Coordinates;
  legSignature: string;
  mode: RouteLegMode;
  origin: Coordinates;
  position: number;
};

export type GoogleLegGeometry = {
  encodedPolyline: string;
  source: "google";
};

export type StraightLegGeometry = {
  destination: Coordinates;
  origin: Coordinates;
  source: "straight";
};

export type CalculatedRouteLeg = {
  computedAt: string;
  distanceMeters: number;
  durationSeconds: number | null;
  estimateKind?: "transit_current_service";
  fallbackReason?: "unsupported_mode" | "no_route";
  geometry: GoogleLegGeometry | StraightLegGeometry;
  legSignature: string;
  mode: RouteLegMode;
  position: number;
  providerMode: GoogleRouteTravelMode | null;
  warnings: RouteLegWarning[];
};

export interface RouteProvider {
  calculateLeg(request: RouteLegRequest): Promise<CalculatedRouteLeg>;
}
