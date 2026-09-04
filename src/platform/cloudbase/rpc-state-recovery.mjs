const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const publicRefPattern = /^[0-9a-f]{64}$/;

function inputObject(parameters) {
  return parameters && typeof parameters === "object" && !Array.isArray(parameters)
    ? parameters
    : null;
}

function uuid(input, key) {
  const value = input?.[key];
  return typeof value === "string" && uuidPattern.test(value) ? value : null;
}

export function cloudBaseStateMutationRecoveryKey(name, parameters, recoverable) {
  if (!recoverable) return null;
  const input = inputObject(parameters);
  if (!input) return null;

  const tripId = uuid(input, "target_trip_id");
  if (name === "clear_route_variant_items") {
    const variantId = uuid(input, "target_variant_id");
    const itemIds = input.target_item_ids;
    return tripId &&
      variantId &&
      Array.isArray(itemIds) &&
      itemIds.length > 0 &&
      itemIds.length <= 2000 &&
      new Set(itemIds).size === itemIds.length &&
      itemIds.every((id) => typeof id === "string" && uuidPattern.test(id))
      ? { itemIds, kind: "clear-items" }
      : null;
  }
  if (name === "clear_day_route_plan") {
    const dayId = uuid(input, "target_day_id");
    const variantId = uuid(input, "target_variant_id");
    return dayId && variantId ? { dayId, kind: "clear-day-route", variantId } : null;
  }
  if (name === "save_day_route_calculation") {
    const planId = uuid(input, "target_plan_id");
    const signature = input.calculated_config_signature;
    const schemaVersion = input.calculated_provider_schema_version ?? "routes-v1";
    const distance = input.calculated_total_distance_meters;
    const duration = input.calculated_total_duration_seconds;
    return planId &&
      typeof signature === "string" &&
      signature.length > 0 &&
      signature.length <= 256 &&
      typeof schemaVersion === "string" &&
      schemaVersion.length > 0 &&
      schemaVersion.length <= 80 &&
      Number.isInteger(distance) &&
      distance >= 0 &&
      (duration === null || (Number.isInteger(duration) && duration >= 0))
      ? { distance, duration, kind: "save-route-calculation", planId, schemaVersion, signature }
      : null;
  }

  const publicRef = input.requested_public_ref;
  if (name === "detach_item_asset_v1") {
    const itemId = uuid(input, "target_item_id");
    return tripId && itemId && typeof publicRef === "string" && publicRefPattern.test(publicRef)
      ? { itemId, kind: "detach-item-asset", publicRef, tripId }
      : null;
  }
  if (name === "detach_research_asset_v1") {
    const researchItemId = uuid(input, "target_research_item_id");
    return tripId &&
      researchItemId &&
      typeof publicRef === "string" &&
      publicRefPattern.test(publicRef)
      ? { kind: "detach-research-asset", publicRef, researchItemId, tripId }
      : null;
  }

  const sessionId = uuid(input, "requested_draft_session_id");
  if (name === "discard_item_asset_session_v1") {
    const itemId = uuid(input, "target_item_id");
    return tripId && itemId && sessionId
      ? { itemId, kind: "discard-item-assets", sessionId, tripId }
      : null;
  }
  if (name === "discard_research_asset_session_v1") {
    const researchItemId = uuid(input, "target_research_item_id");
    return tripId && researchItemId && sessionId
      ? { kind: "discard-research-assets", researchItemId, sessionId, tripId }
      : null;
  }

  if (name === "fail_item_asset_v1") {
    const assetId = uuid(input, "target_asset_id");
    return assetId ? { assetId, kind: "fail-item-asset" } : null;
  }
  if (name === "fail_share_image_version_v1") {
    const versionId = uuid(input, "target_version_id");
    return versionId ? { kind: "fail-share-image", versionId } : null;
  }
  if (name === "revoke_share_page_v1") {
    const sharePageId = uuid(input, "target_share_page_id");
    return sharePageId ? { kind: "revoke-share-page", sharePageId } : null;
  }
  if (name === "revoke_share_image_export_v1") {
    const exportId = uuid(input, "target_export_id");
    return exportId ? { exportId, kind: "revoke-share-image" } : null;
  }
  return null;
}

export function recoverCloudBaseEmptyLookupResult(original, lookup, data = null) {
  if (lookup?.error || !Array.isArray(lookup?.data) || lookup.data.length !== 0) return original;
  return { ...original, data, error: null };
}

export function recoverCloudBaseSingleLookupResult(original, lookup, data = null) {
  if (lookup?.error || !Array.isArray(lookup?.data) || lookup.data.length !== 1) return original;
  return { ...original, data, error: null };
}

export function recoverCloudBaseNonNullLookupResult(original, lookup, field, data = null) {
  if (
    lookup?.error ||
    !Array.isArray(lookup?.data) ||
    lookup.data.length !== 1 ||
    lookup.data[0]?.[field] === null ||
    lookup.data[0]?.[field] === undefined
  )
    return original;
  return { ...original, data, error: null };
}
