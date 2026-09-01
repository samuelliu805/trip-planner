import type { Coordinates } from "../../maps/types.ts";

function encodeValue(value: number) {
  let remaining = value < 0 ? ~(value << 1) : value << 1;
  let encoded = "";
  while (remaining >= 0x20) {
    encoded += String.fromCharCode((0x20 | (remaining & 0x1f)) + 63);
    remaining >>= 5;
  }
  return encoded + String.fromCharCode(remaining + 63);
}

export function encodePolyline5(coordinates: Coordinates[]) {
  let previousLatitude = 0;
  let previousLongitude = 0;
  let encoded = "";
  for (const coordinate of coordinates) {
    const latitude = Math.round(coordinate.latitude * 1e5);
    const longitude = Math.round(coordinate.longitude * 1e5);
    encoded += encodeValue(latitude - previousLatitude);
    encoded += encodeValue(longitude - previousLongitude);
    previousLatitude = latitude;
    previousLongitude = longitude;
  }
  return encoded;
}
