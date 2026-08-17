import "server-only";

import { z } from "zod";

import { createAdminClient } from "@/lib/supabase/admin";

const cleanupBatchSchema = z.array(
  z
    .object({
      assetId: z.uuid(),
      bucket: z.literal("trip-assets"),
      paths: z.array(z.string().min(1).max(500)).max(2),
    })
    .strict(),
);

export async function drainAssetDeletionQueue(limit = 100) {
  const admin = createAdminClient();
  const batchResult = await admin.rpc("asset_cleanup_batch_v1", { requested_limit: limit });
  const batch = cleanupBatchSchema.safeParse(batchResult.data);
  if (batchResult.error || !batch.success)
    return { deletedAssets: 0, deletedFiles: 0, error: "Asset cleanup batch unavailable" };

  const completed: string[] = [];
  let deletedFiles = 0;
  for (const candidate of batch.data) {
    const { error } = candidate.paths.length
      ? await admin.storage.from(candidate.bucket).remove(candidate.paths)
      : { error: null };
    if (error) {
      await admin.rpc("fail_asset_cleanup_v1", {
        requested_error: error.message,
        target_asset_id: candidate.assetId,
      });
      continue;
    }
    deletedFiles += candidate.paths.length;
    completed.push(candidate.assetId);
  }

  if (!completed.length) return { deletedAssets: 0, deletedFiles, error: null };
  const finalized = await admin.rpc("finalize_asset_cleanup_v1", {
    target_asset_ids: completed,
  });
  return finalized.error
    ? { deletedAssets: 0, deletedFiles, error: "Asset cleanup could not be finalized" }
    : { deletedAssets: finalized.data, deletedFiles, error: null };
}
