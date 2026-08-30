import type { CalculatedRouteLeg, EncodedLegGeometry, StraightLegGeometry } from "./types.ts";

function routesV1Geometry(geometry: EncodedLegGeometry | StraightLegGeometry) {
  if (geometry.source === "straight")
    return {
      destination: {
        latitude: geometry.destination.latitude,
        longitude: geometry.destination.longitude,
      },
      origin: { latitude: geometry.origin.latitude, longitude: geometry.origin.longitude },
      source: "straight" as const,
    };

  if (geometry.provider !== "google" || geometry.encoding !== "polyline5")
    throw new Error("routes-v1 can persist only Google polyline5 geometry.");
  return {
    encodedPolyline: geometry.encodedPolyline,
    source: "google" as const,
  };
}

/**
 * Preserve the deployed routes-v1 JSON contract for database/public-projection compatibility.
 * Provider-neutral geometry remains an in-memory model until a versioned persistence migration.
 */
export function serializeRoutesV1CalculatedLegs(legs: CalculatedRouteLeg[]) {
  return legs.map((leg) => ({ ...leg, geometry: routesV1Geometry(leg.geometry) }));
}
