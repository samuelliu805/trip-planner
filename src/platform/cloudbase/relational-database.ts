import "server-only";

import type { RelationalDatabase } from "@/platform/contracts/relational";

import { createCloudBaseUserContext } from "./database";
import { normalizeCloudBaseRpcResult } from "./rpc-result-normalization.mjs";

export async function createCloudBaseRelationalDatabase(): Promise<RelationalDatabase> {
  const { db } = await createCloudBaseUserContext();
  const rpc = ((name: string, parameters: Readonly<Record<string, unknown>>) => {
    const result = db.rpc(name, parameters);
    if (name !== "owns_pending_share_image_object_v1") return result;
    return result.then((value) => normalizeCloudBaseRpcResult(name, value));
  }) as unknown as RelationalDatabase["rpc"];
  return {
    from: db.from.bind(db),
    rpc,
  } as unknown as RelationalDatabase;
}
