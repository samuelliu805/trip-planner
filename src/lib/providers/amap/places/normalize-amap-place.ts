import { gcj02ToWgs84, type Gcj02Coordinates } from "../coordinates.ts";
import type { AmapLngLat, AmapPoi } from "../sdk-types.ts";
import type { PlaceSnapshot } from "../../places/types.ts";

function text(value: string | string[] | undefined) {
  const result = Array.isArray(value) ? value[0] : value;
  return result?.trim() || undefined;
}

function locationCoordinates(location: AmapPoi["location"]): Gcj02Coordinates | null {
  if (typeof location === "string") {
    const [longitude, latitude] = location.split(",").map(Number);
    return Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { coordinateSystem: "gcj02", latitude, longitude }
      : null;
  }
  if (!location) return null;
  const lngLat = location as Partial<AmapLngLat> & { lat?: unknown; lng?: unknown };
  const latitude =
    typeof lngLat.getLat === "function"
      ? lngLat.getLat()
      : typeof lngLat.lat === "number"
        ? lngLat.lat
        : Number.NaN;
  const longitude =
    typeof lngLat.getLng === "function"
      ? lngLat.getLng()
      : typeof lngLat.lng === "number"
        ? lngLat.lng
        : Number.NaN;
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { coordinateSystem: "gcj02", latitude, longitude }
    : null;
}

export function normalizeAmapPlace(value: AmapPoi): PlaceSnapshot {
  const providerPlaceId = value.id?.trim();
  const displayName = value.name?.trim();
  const gcj02 = locationCoordinates(value.location);
  if (!providerPlaceId || !displayName || !gcj02)
    throw new Error("The selected place is missing required map details.");

  const city = text(value.cityname);
  const district = value.adname?.trim() || undefined;
  const province = value.pname?.trim() || undefined;
  const address = text(value.address);
  const formattedAddress = [...new Set([province, city, district, address].filter(Boolean))].join(
    " ",
  );
  if (!formattedAddress) throw new Error("The selected place is missing its address.");
  return {
    ...gcj02ToWgs84(gcj02),
    ...(province && { administrativeAreaName: province }),
    displayName,
    ...(formattedAddress && { formattedAddress }),
    ...((city || district) && {
      localityKind: city ? ("locality" as const) : ("administrative_area_level_2" as const),
      localityName: city ?? district,
      localitySource: "amap_poi" as const,
    }),
    provider: "amap",
    providerPlaceId,
  };
}
