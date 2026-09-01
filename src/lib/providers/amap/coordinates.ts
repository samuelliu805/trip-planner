import { wgs84Coordinates, type Coordinates } from "../maps/types.ts";

export type Gcj02Coordinates = {
  coordinateSystem: "gcj02";
  latitude: number;
  longitude: number;
};

const axis = 6_378_245;
const eccentricitySquared = 0.006693421622965943;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

function outsideChina(latitude: number, longitude: number) {
  return longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271;
}

function latitudeTransform(x: number, y: number) {
  return (
    -100 +
    2 * x +
    3 * y +
    0.2 * y * y +
    0.1 * x * y +
    0.2 * Math.sqrt(Math.abs(x)) +
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3 +
    ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3 +
    ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3
  );
}

function longitudeTransform(x: number, y: number) {
  return (
    300 +
    x +
    2 * y +
    0.1 * x * x +
    0.1 * x * y +
    0.1 * Math.sqrt(Math.abs(x)) +
    ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3 +
    ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3 +
    ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3
  );
}

function offset(latitude: number, longitude: number) {
  const latitudeRadians = radians(latitude);
  const sinLatitude = Math.sin(latitudeRadians);
  const magic = 1 - eccentricitySquared * sinLatitude * sinLatitude;
  const rootMagic = Math.sqrt(magic);
  const latitudeDelta = latitudeTransform(longitude - 105, latitude - 35);
  const longitudeDelta = longitudeTransform(longitude - 105, latitude - 35);
  return {
    latitude:
      (latitudeDelta * 180) /
      (((axis * (1 - eccentricitySquared)) / (magic * rootMagic)) * Math.PI),
    longitude: (longitudeDelta * 180) / ((axis / rootMagic) * Math.cos(latitudeRadians) * Math.PI),
  };
}

export function wgs84ToGcj02(coordinates: Coordinates): Gcj02Coordinates {
  if (outsideChina(coordinates.latitude, coordinates.longitude))
    return {
      coordinateSystem: "gcj02",
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    };
  const delta = offset(coordinates.latitude, coordinates.longitude);
  return {
    coordinateSystem: "gcj02",
    latitude: coordinates.latitude + delta.latitude,
    longitude: coordinates.longitude + delta.longitude,
  };
}

export function gcj02ToWgs84(coordinates: Gcj02Coordinates): Coordinates {
  if (outsideChina(coordinates.latitude, coordinates.longitude))
    return wgs84Coordinates(coordinates.latitude, coordinates.longitude);

  let latitude = coordinates.latitude;
  let longitude = coordinates.longitude;
  for (let index = 0; index < 8; index += 1) {
    const projected = wgs84ToGcj02(wgs84Coordinates(latitude, longitude));
    latitude -= projected.latitude - coordinates.latitude;
    longitude -= projected.longitude - coordinates.longitude;
  }
  return wgs84Coordinates(latitude, longitude);
}
