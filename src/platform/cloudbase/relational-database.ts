import "server-only";

import type { RelationalDatabase } from "@/platform/contracts/relational";

import { createCloudBaseUserContext } from "./database";
import { isCloudBaseScalarUuidParseError } from "./errors";
import {
  cloudBaseDayRoutePlanRecoveryKey,
  cloudBasePlaceUpsertRecoveryKey,
  normalizeCloudBaseRpcResult,
  recoverCloudBaseScalarUuidResult,
} from "./rpc-result-normalization.mjs";

export async function createCloudBaseRelationalDatabase(): Promise<RelationalDatabase> {
  const { db } = await createCloudBaseUserContext();
  const rpc = ((name: string, parameters: Readonly<Record<string, unknown>>) => {
    return db.rpc(name, parameters).then(async (value) => {
      const recoveryKey = cloudBasePlaceUpsertRecoveryKey(
        name,
        parameters,
        isCloudBaseScalarUuidParseError(value.error),
      );
      if (recoveryKey) {
        const lookup = await db
          .from("places")
          .select("id")
          .eq("trip_id", recoveryKey.tripId)
          .eq("source", recoveryKey.provider)
          .eq("provider_place_id", recoveryKey.providerPlaceId);
        return recoverCloudBaseScalarUuidResult(value, lookup);
      }
      const routePlanRecoveryKey = cloudBaseDayRoutePlanRecoveryKey(
        name,
        parameters,
        isCloudBaseScalarUuidParseError(value.error),
      );
      if (routePlanRecoveryKey) {
        const lookup = await db
          .from("day_route_plans")
          .select("id")
          .eq("day_id", routePlanRecoveryKey.dayId)
          .eq("variant_id", routePlanRecoveryKey.variantId);
        return recoverCloudBaseScalarUuidResult(value, lookup);
      }
      return normalizeCloudBaseRpcResult(name, value);
    });
  }) as unknown as RelationalDatabase["rpc"];
  return {
    from: db.from.bind(db),
    rpc,
  } as unknown as RelationalDatabase;
}
