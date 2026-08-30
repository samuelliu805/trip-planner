import { coordinatesFromJson } from "../maps/types.ts";
import { decodeEncodedPolyline } from "./geo.ts";
import type { EncodedLegGeometry, StraightLegGeometry } from "./types.ts";

export type RouteLegGeometry = EncodedLegGeometry | StraightLegGeometry;

export function routeGeometryFromJson(value: unknown): RouteLegGeometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.source === "straight") {
    const origin = coordinatesFromJson(candidate.origin);
    const destination = coordinatesFromJson(candidate.destination);
    if (!origin || !destination) return null;
    if (candidate.coordinateSystem !== undefined && candidate.coordinateSystem !== "wgs84")
      return null;
    return { coordinateSystem: "wgs84", destination, origin, source: "straight" };
  }

  // Legacy routes-v1 Google geometry used { source: "google", encodedPolyline }.
  const legacyGoogle = candidate.source === "google";
  if (legacyGoogle || candidate.source === "encoded") {
    const provider = legacyGoogle ? "google" : candidate.provider;
    if (provider !== "google" && provider !== "amap") return null;
    if (
      typeof candidate.encodedPolyline !== "string" ||
      !candidate.encodedPolyline ||
      (!legacyGoogle && candidate.encoding !== "polyline5") ||
      (candidate.coordinateSystem !== undefined && candidate.coordinateSystem !== "wgs84")
    )
      return null;
    return {
      coordinateSystem: "wgs84",
      encodedPolyline: candidate.encodedPolyline,
      encoding: "polyline5",
      provider,
      source: "encoded",
    };
  }
  return null;
}

export function routeGeometryCoordinates(geometry: RouteLegGeometry) {
  return geometry.source === "straight"
    ? [geometry.origin, geometry.destination]
    : decodeEncodedPolyline(geometry.encodedPolyline);
}
