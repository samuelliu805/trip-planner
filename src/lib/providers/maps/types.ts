export const coordinateSystems = ["wgs84"] as const;

export type CoordinateSystem = (typeof coordinateSystems)[number];

export type CoordinateInput = {
  coordinateSystem?: CoordinateSystem;
  latitude: number;
  longitude: number;
};

/** Canonical domain coordinates. Persisted legacy values are normalized to this shape on read. */
export type Coordinates = CoordinateInput & {
  coordinateSystem: "wgs84";
};

export function hasValidCoordinates(value: CoordinateInput): boolean {
  return (
    (value.coordinateSystem === undefined || value.coordinateSystem === "wgs84") &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

export function wgs84Coordinates(latitude: number, longitude: number): Coordinates {
  const coordinates = { coordinateSystem: "wgs84" as const, latitude, longitude };
  if (!hasValidCoordinates(coordinates)) throw new Error("The coordinates are invalid.");
  return coordinates;
}

export function coordinatesFromJson(value: unknown): Coordinates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<CoordinateInput> & { coordinateSystem?: unknown };
  if (candidate.coordinateSystem !== undefined && candidate.coordinateSystem !== "wgs84")
    return null;
  if (
    typeof candidate.latitude !== "number" ||
    typeof candidate.longitude !== "number" ||
    !hasValidCoordinates({
      coordinateSystem: "wgs84",
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    })
  )
    return null;
  return wgs84Coordinates(candidate.latitude, candidate.longitude);
}
