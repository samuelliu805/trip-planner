import type { PlaceSnapshot } from "@/lib/providers/places/types";

export function providerPlaceRpcArguments(tripId: string, snapshot: PlaceSnapshot) {
  if (snapshot.provider !== "google" && snapshot.provider !== "amap")
    throw new Error("Only normalized map provider snapshots can be persisted here.");
  if (!snapshot.providerPlaceId || snapshot.coordinateSystem !== "wgs84")
    throw new Error("A provider place ID and canonical WGS-84 coordinates are required.");
  if (snapshot.provider === "amap" && !snapshot.formattedAddress?.trim())
    throw new Error("An AMap place address is required before persistence.");

  return {
    place_administrative_area_name: snapshot.administrativeAreaName,
    place_coordinate_system: snapshot.coordinateSystem,
    place_country_code: snapshot.countryCode,
    place_display_name: snapshot.displayName,
    place_formatted_address: snapshot.formattedAddress ?? "",
    place_latitude: snapshot.latitude,
    place_locality_kind: snapshot.localityKind,
    place_locality_name: snapshot.localityName,
    place_locality_source: snapshot.localitySource,
    place_longitude: snapshot.longitude,
    place_provider: snapshot.provider,
    provider_place_id: snapshot.providerPlaceId,
    target_trip_id: tripId,
  };
}
