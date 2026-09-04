import "server-only";

import type { RelationalDatabase } from "@/platform/contracts/relational";

import { createCloudBasePublicDatabase } from "./client";
import { createCloudBaseUserContext } from "./database";
import { isCloudBaseScalarUuidParseError } from "./errors";
import {
  cloudBaseDayRoutePlanRecoveryKey,
  cloudBaseOrderMutationRecoveryKey,
  cloudBasePlaceUpsertRecoveryKey,
  cloudBaseScalarMutationRecoveryKey,
  normalizeCloudBaseRpcResult,
  recoverCloudBaseDeletedUuidResult,
  recoverCloudBaseOrderedVoidResult,
  recoverCloudBaseScalarUuidResult,
} from "./rpc-result-normalization.mjs";
import {
  cloudBaseStateMutationRecoveryKey,
  recoverCloudBaseEmptyLookupResult,
  recoverCloudBaseNonNullLookupResult,
  recoverCloudBaseSingleLookupResult,
} from "./rpc-state-recovery.mjs";

export async function createCloudBaseRelationalDatabase(): Promise<RelationalDatabase> {
  const { db } = await createCloudBaseUserContext();
  const rpc = ((name: string, parameters: Readonly<Record<string, unknown>>) => {
    return db.rpc(name, parameters).then(async (value) => {
      const recoverable = isCloudBaseScalarUuidParseError(value.error);
      const recoveryKey = cloudBasePlaceUpsertRecoveryKey(name, parameters, recoverable);
      if (recoveryKey) {
        const lookup = await db
          .from("places")
          .select("id")
          .eq("trip_id", recoveryKey.tripId)
          .eq("source", recoveryKey.provider)
          .eq("provider_place_id", recoveryKey.providerPlaceId);
        return recoverCloudBaseScalarUuidResult(value, lookup);
      }
      const routePlanRecoveryKey = cloudBaseDayRoutePlanRecoveryKey(name, parameters, recoverable);
      if (routePlanRecoveryKey) {
        const lookup = await db
          .from("day_route_plans")
          .select("id")
          .eq("day_id", routePlanRecoveryKey.dayId)
          .eq("variant_id", routePlanRecoveryKey.variantId);
        return recoverCloudBaseScalarUuidResult(value, lookup);
      }
      const mutationKey = cloudBaseScalarMutationRecoveryKey(name, parameters, recoverable);
      if (mutationKey?.kind === "insert-day") {
        const lookup = await db
          .from("trip_days")
          .select("id")
          .eq("variant_id", mutationKey.variantId)
          .eq("day_number", mutationKey.dayNumber);
        return recoverCloudBaseScalarUuidResult(value, lookup);
      }
      if (mutationKey?.kind === "remove-day") {
        const lookup = await db.from("trip_days").select("id").eq("id", mutationKey.dayId);
        return recoverCloudBaseDeletedUuidResult(value, lookup, mutationKey.dayId);
      }
      if (mutationKey?.kind === "create-variant") {
        const lookup = await db
          .from("route_variants")
          .select("id")
          .eq("trip_id", mutationKey.tripId)
          .eq("name", mutationKey.variantName)
          .eq("color", mutationKey.variantColor);
        return recoverCloudBaseScalarUuidResult(value, lookup);
      }
      if (mutationKey?.kind === "update-variant") {
        const lookup = await db
          .from("route_variants")
          .select("id")
          .eq("id", mutationKey.variantId)
          .eq("trip_id", mutationKey.tripId)
          .eq("name", mutationKey.variantName)
          .eq("color", mutationKey.variantColor);
        return recoverCloudBaseScalarUuidResult(value, lookup);
      }
      if (mutationKey?.kind === "primary-variant") {
        const lookup = await db
          .from("route_variants")
          .select("id")
          .eq("id", mutationKey.variantId)
          .eq("trip_id", mutationKey.tripId)
          .eq("is_primary", true);
        return recoverCloudBaseScalarUuidResult(value, lookup);
      }
      if (mutationKey?.kind === "delete-variant") {
        const lookup = await db
          .from("route_variants")
          .select("id")
          .eq("id", mutationKey.variantId)
          .eq("trip_id", mutationKey.tripId);
        return recoverCloudBaseDeletedUuidResult(value, lookup, mutationKey.variantId);
      }
      const orderKey = cloudBaseOrderMutationRecoveryKey(name, parameters, recoverable);
      if (orderKey?.kind === "items") {
        const lookup = await db
          .from("itinerary_items")
          .select("id")
          .eq("day_id", orderKey.dayId)
          .order("sort_order")
          .order("id");
        return recoverCloudBaseOrderedVoidResult(value, lookup, orderKey.orderedIds);
      }
      if (orderKey?.kind === "days") {
        const lookup = await db
          .from("trip_days")
          .select("id")
          .eq("variant_id", orderKey.variantId)
          .order("day_number");
        return recoverCloudBaseOrderedVoidResult(value, lookup, orderKey.orderedIds);
      }
      const stateKey = cloudBaseStateMutationRecoveryKey(name, parameters, recoverable);
      if (stateKey?.kind === "clear-items") {
        const lookup = await db.from("itinerary_items").select("id").in("id", stateKey.itemIds);
        return recoverCloudBaseEmptyLookupResult(value, lookup, stateKey.itemIds.length);
      }
      if (stateKey?.kind === "clear-day-route") {
        const lookup = await db
          .from("day_route_plans")
          .select("id")
          .eq("day_id", stateKey.dayId)
          .eq("variant_id", stateKey.variantId);
        return recoverCloudBaseEmptyLookupResult(value, lookup);
      }
      if (stateKey?.kind === "save-route-calculation") {
        const lookup = await db
          .from("day_route_calculations")
          .select("id")
          .eq("plan_id", stateKey.planId)
          .eq("config_signature", stateKey.signature)
          .eq("total_distance_meters", stateKey.distance)
          .eq("total_duration_seconds", stateKey.duration)
          .eq("provider_schema_version", stateKey.schemaVersion);
        return recoverCloudBaseSingleLookupResult(value, lookup);
      }
      if (stateKey?.kind === "detach-item-asset") {
        const lookup = await db
          .from("asset_links")
          .select("id")
          .eq("trip_id", stateKey.tripId)
          .eq("itinerary_item_id", stateKey.itemId)
          .eq("public_ref", stateKey.publicRef);
        return recoverCloudBaseEmptyLookupResult(value, lookup);
      }
      if (stateKey?.kind === "detach-research-asset") {
        const lookup = await db
          .from("asset_links")
          .select("id")
          .eq("trip_id", stateKey.tripId)
          .eq("research_item_id", stateKey.researchItemId)
          .eq("public_ref", stateKey.publicRef);
        return recoverCloudBaseEmptyLookupResult(value, lookup);
      }
      if (stateKey?.kind === "discard-item-assets") {
        const lookup = await db
          .from("asset_links")
          .select("id")
          .eq("trip_id", stateKey.tripId)
          .eq("itinerary_item_id", stateKey.itemId)
          .eq("draft_session_id", stateKey.sessionId);
        return recoverCloudBaseEmptyLookupResult(value, lookup, 0);
      }
      if (stateKey?.kind === "discard-research-assets") {
        const lookup = await db
          .from("asset_links")
          .select("id")
          .eq("trip_id", stateKey.tripId)
          .eq("research_item_id", stateKey.researchItemId)
          .eq("draft_session_id", stateKey.sessionId);
        return recoverCloudBaseEmptyLookupResult(value, lookup, 0);
      }
      if (stateKey?.kind === "fail-item-asset") {
        const lookup = await db
          .from("assets")
          .select("id")
          .eq("id", stateKey.assetId)
          .eq("status", "failed");
        return recoverCloudBaseSingleLookupResult(value, lookup);
      }
      if (stateKey?.kind === "fail-share-image") {
        const lookup = await db
          .from("share_image_versions")
          .select("id")
          .eq("id", stateKey.versionId)
          .eq("status", "failed");
        return recoverCloudBaseSingleLookupResult(value, lookup);
      }
      if (stateKey?.kind === "revoke-share-page") {
        const lookup = await db
          .from("public_itinerary_links")
          .select("id, revoked_at")
          .eq("id", stateKey.sharePageId);
        return recoverCloudBaseNonNullLookupResult(value, lookup, "revoked_at");
      }
      if (stateKey?.kind === "revoke-share-image") {
        const lookup = await db
          .from("share_image_exports")
          .select("id, revoked_at")
          .eq("id", stateKey.exportId);
        return recoverCloudBaseNonNullLookupResult(value, lookup, "revoked_at");
      }
      return normalizeCloudBaseRpcResult(name, value);
    });
  }) as unknown as RelationalDatabase["rpc"];
  return {
    from: db.from.bind(db),
    rpc,
  } as unknown as RelationalDatabase;
}

export function createCloudBasePublicRelationalDatabase(): RelationalDatabase {
  const db = createCloudBasePublicDatabase();
  return {
    from: db.from.bind(db),
    rpc: db.rpc.bind(db),
  } as unknown as RelationalDatabase;
}
