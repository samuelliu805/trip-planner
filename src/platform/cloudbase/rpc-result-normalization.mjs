export function normalizeCloudBaseRpcResult(name, result) {
  if (name !== "owns_pending_share_image_object_v1" || result?.error) return result;
  const data = result?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== "authorized" || typeof data.authorized !== "boolean") {
    return result;
  }
  return { ...result, data: data.authorized };
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function cloudBasePlaceUpsertRecoveryKey(name, parameters, recoverable) {
  if (name !== "upsert_place_snapshot_v3" || !recoverable) return null;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return null;
  const tripId = parameters.target_trip_id;
  const provider = parameters.place_provider;
  const providerPlaceId = parameters.provider_place_id;
  if (
    typeof tripId !== "string" ||
    !uuidPattern.test(tripId) ||
    (provider !== "google" && provider !== "amap") ||
    typeof providerPlaceId !== "string" ||
    !providerPlaceId.trim() ||
    providerPlaceId.length > 512 ||
    parameters.place_coordinate_system !== "wgs84" ||
    !Number.isFinite(parameters.place_latitude) ||
    parameters.place_latitude < -90 ||
    parameters.place_latitude > 90 ||
    !Number.isFinite(parameters.place_longitude) ||
    parameters.place_longitude < -180 ||
    parameters.place_longitude > 180
  ) {
    return null;
  }
  return { provider, providerPlaceId, tripId };
}

export function recoverCloudBasePlaceUpsertResult(original, lookup) {
  if (lookup?.error || !Array.isArray(lookup?.data) || lookup.data.length !== 1) return original;
  const id = lookup.data[0]?.id;
  if (typeof id !== "string" || !uuidPattern.test(id)) return original;
  return { ...original, data: id, error: null };
}
