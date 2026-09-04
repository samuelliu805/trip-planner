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

function parametersObject(parameters) {
  return parameters && typeof parameters === "object" && !Array.isArray(parameters)
    ? parameters
    : null;
}

function uuidParameter(parameters, key) {
  const value = parameters?.[key];
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

function uuidList(parameters, key, maximum) {
  const value = parameters?.[key];
  if (
    !Array.isArray(value) ||
    !value.length ||
    value.length > maximum ||
    !value.every((id) => typeof id === "string" && uuidPattern.test(id)) ||
    new Set(value).size !== value.length
  ) {
    return null;
  }
  return value;
}

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

export function cloudBaseDayRoutePlanRecoveryKey(name, parameters, recoverable) {
  if (name !== "save_day_route_plan" || !recoverable) return null;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) return null;
  const dayId = parameters.target_day_id;
  const variantId = parameters.target_variant_id;
  const itemIds = parameters.ordered_item_ids;
  const legModes = parameters.requested_leg_modes;
  if (
    typeof dayId !== "string" ||
    !uuidPattern.test(dayId) ||
    typeof variantId !== "string" ||
    !uuidPattern.test(variantId) ||
    !Array.isArray(itemIds) ||
    itemIds.length < 2 ||
    itemIds.length > 20 ||
    !itemIds.every((id) => typeof id === "string" && uuidPattern.test(id)) ||
    !Array.isArray(legModes) ||
    legModes.length !== itemIds.length - 1 ||
    !legModes.every((mode) => typeof mode === "string" && mode.length > 0)
  ) {
    return null;
  }
  return { dayId, variantId };
}

export function cloudBaseScalarMutationRecoveryKey(name, parameters, recoverable) {
  if (!recoverable) return null;
  const input = parametersObject(parameters);
  if (!input) return null;
  const tripId = uuidParameter(input, "target_trip_id");
  const variantId = uuidParameter(input, "target_variant_id");

  if (name === "insert_variant_day") {
    const dayNumber = input.before_day_number;
    if (!tripId || !variantId || !Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 366)
      return null;
    return { dayNumber, kind: "insert-day", tripId, variantId };
  }
  if (name === "remove_variant_day") {
    const dayId = uuidParameter(input, "target_day_id");
    return tripId && variantId && dayId ? { dayId, kind: "remove-day", tripId, variantId } : null;
  }
  if (name === "create_route_variant" || name === "duplicate_route_variant") {
    const sourceVariantId = uuidParameter(input, "source_variant_id");
    const variantName = typeof input.variant_name === "string" ? input.variant_name.trim() : "";
    const variantColor =
      typeof input.variant_color === "string" ? input.variant_color.toLowerCase() : "";
    if (
      !tripId ||
      !sourceVariantId ||
      !variantName ||
      variantName.length > 80 ||
      !/^#[0-9a-f]{6}$/.test(variantColor)
    )
      return null;
    return { kind: "create-variant", tripId, variantColor, variantName };
  }
  if (name === "update_route_variant_metadata") {
    const variantName = typeof input.variant_name === "string" ? input.variant_name.trim() : "";
    const variantColor =
      typeof input.variant_color === "string" ? input.variant_color.toLowerCase() : "";
    if (
      !tripId ||
      !variantId ||
      !variantName ||
      variantName.length > 80 ||
      !/^#[0-9a-f]{6}$/.test(variantColor)
    )
      return null;
    return { kind: "update-variant", tripId, variantColor, variantId, variantName };
  }
  if (name === "set_primary_route_variant" && tripId && variantId)
    return { kind: "primary-variant", tripId, variantId };
  if (name === "delete_route_variant" && tripId && variantId)
    return { kind: "delete-variant", tripId, variantId };
  return null;
}

export function cloudBaseOrderMutationRecoveryKey(name, parameters, recoverable) {
  if (!recoverable) return null;
  const input = parametersObject(parameters);
  if (!input) return null;
  if (name === "reorder_itinerary_items") {
    const dayId = uuidParameter(input, "target_day_id");
    const orderedIds = uuidList(input, "ordered_item_ids", 2000);
    return dayId && orderedIds ? { dayId, kind: "items", orderedIds } : null;
  }
  if (name === "reorder_variant_days") {
    const tripId = uuidParameter(input, "target_trip_id");
    const variantId = uuidParameter(input, "target_variant_id");
    const orderedIds = uuidList(input, "ordered_day_ids", 366);
    return tripId && variantId && orderedIds
      ? { kind: "days", orderedIds, tripId, variantId }
      : null;
  }
  return null;
}

export function recoverCloudBaseScalarUuidResult(original, lookup) {
  if (lookup?.error || !Array.isArray(lookup?.data) || lookup.data.length !== 1) return original;
  const id = lookup.data[0]?.id;
  if (typeof id !== "string" || !uuidPattern.test(id)) return original;
  return { ...original, data: id, error: null };
}

export function recoverCloudBaseDeletedUuidResult(original, lookup, expectedId) {
  if (
    lookup?.error ||
    !Array.isArray(lookup?.data) ||
    lookup.data.length !== 0 ||
    typeof expectedId !== "string" ||
    !uuidPattern.test(expectedId)
  )
    return original;
  return { ...original, data: expectedId, error: null };
}

export function recoverCloudBaseOrderedVoidResult(original, lookup, expectedIds) {
  if (lookup?.error || !Array.isArray(lookup?.data) || !Array.isArray(expectedIds)) return original;
  const actualIds = lookup.data.map((row) => row?.id);
  if (
    actualIds.length !== expectedIds.length ||
    actualIds.some((id, index) => id !== expectedIds[index])
  )
    return original;
  return { ...original, data: null, error: null };
}

export const recoverCloudBasePlaceUpsertResult = recoverCloudBaseScalarUuidResult;
