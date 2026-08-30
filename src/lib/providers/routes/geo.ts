import { wgs84Coordinates, type CoordinateInput, type Coordinates } from "../maps/types.ts";

const earthRadiusMeters = 6_371_008.8;

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineDistanceMeters(
  origin: CoordinateInput,
  destination: CoordinateInput,
): number {
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

export function decodeEncodedPolyline(encoded: string): Coordinates[] {
  const coordinates: Coordinates[] = [];
  let latitude = 0;
  let longitude = 0;
  let index = 0;

  const decodeValue = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new Error("The encoded route polyline is invalid.");
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    latitude += decodeValue();
    longitude += decodeValue();
    coordinates.push(wgs84Coordinates(latitude / 1e5, longitude / 1e5));
  }

  return coordinates;
}
