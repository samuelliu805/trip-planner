import type { MapsProviderId } from "../maps/provider.ts";
import type { Coordinates } from "../maps/types.ts";

import type { RouteLegMode } from "../../../features/routes/types.ts";

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

export type EncodedLegGeometry = {
  coordinateSystem: "wgs84";
  encodedPolyline: string;
  encoding: "polyline5";
  provider: MapsProviderId;
  source: "encoded";
};

export type StraightLegGeometry = {
  coordinateSystem: "wgs84";
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
  geometry: EncodedLegGeometry | StraightLegGeometry;
  legSignature: string;
  mode: RouteLegMode;
  position: number;
  /** Opaque provider mode retained for diagnostics and persisted compatibility. */
  providerMode: string | null;
  warnings: RouteLegWarning[];
};

export interface RouteProvider {
  readonly id: MapsProviderId;
  calculateLeg(request: RouteLegRequest): Promise<CalculatedRouteLeg>;
}
