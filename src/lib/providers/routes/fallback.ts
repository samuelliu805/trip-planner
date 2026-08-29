import { haversineDistanceMeters } from "./geo.ts";
import type { CalculatedRouteLeg, RouteLegRequest, RouteLegWarning } from "./types.ts";

const safetyWarnings = (request: RouteLegRequest): RouteLegWarning[] => {
  if (request.mode === "walk") {
    return [
      {
        code: "walking_safety",
        message:
          "Walking routes may be missing sidewalks or pedestrian paths. Use appropriate caution.",
      },
    ];
  }
  if (request.mode === "bike") {
    return [
      {
        code: "bicycle_safety",
        message: "Bicycle routes may be missing dedicated cycling paths. Use appropriate caution.",
      },
    ];
  }
  return [];
};

export function routeModeWarnings(request: RouteLegRequest): RouteLegWarning[] {
  return safetyWarnings(request);
}

export function straightFallbackLeg(
  request: RouteLegRequest,
  reason: "unsupported_mode" | "no_route",
  warningMessage: string,
  computedAt = new Date().toISOString(),
): CalculatedRouteLeg {
  const reasonWarning: RouteLegWarning = { code: reason, message: warningMessage };
  return {
    computedAt,
    distanceMeters: haversineDistanceMeters(request.origin, request.destination),
    durationSeconds: null,
    fallbackReason: reason,
    geometry: {
      coordinateSystem: "wgs84",
      destination: request.destination,
      origin: request.origin,
      source: "straight",
    },
    legSignature: request.legSignature,
    mode: request.mode,
    position: request.position,
    providerMode: null,
    warnings: [reasonWarning, ...safetyWarnings(request)],
  };
}
