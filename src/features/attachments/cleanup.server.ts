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

const untrackedStorageBatchSchema = z
  .array(
    z
      .string()
      .min(1)
      .max(500)
      .regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(original|(thumbnail|poster)\.webp)$/),
  )
  .max(100);

export async function drainAssetDeletionQueue(limit = 100) {
  const admin = createAdminClient();
  const batchResult = await admin.rpc("asset_cleanup_batch_v2", { requested_limit: limit });
  const batch = cleanupBatchSchema.safeParse(batchResult.data);
  if (batchResult.error || !batch.success)
    return {
      deletedAssets: 0,
      deletedFiles: 0,
      error: "Asset cleanup batch unavailable",
      untrackedFiles: 0,
    };

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

  let deletedAssets = 0;
  if (completed.length) {
    const finalized = await admin.rpc("finalize_asset_cleanup_v1", {
      target_asset_ids: completed,
    });
    if (finalized.error)
      return {
        deletedAssets: 0,
        deletedFiles,
        error: "Asset cleanup could not be finalized",
        untrackedFiles: 0,
      };
    deletedAssets = finalized.data ?? 0;
  }

  const untrackedResult = await admin.rpc("untracked_asset_storage_batch_v1", {
    requested_limit: limit,
  });
  const untracked = untrackedStorageBatchSchema.safeParse(untrackedResult.data);
  if (untrackedResult.error || !untracked.success)
    return {
      deletedAssets,
      deletedFiles,
      error: "Untracked asset cleanup batch unavailable",
      untrackedFiles: 0,
    };
  if (untracked.data.length) {
    const removed = await admin.storage.from("trip-assets").remove(untracked.data);
    if (removed.error)
      return {
        deletedAssets,
        deletedFiles,
        error: "Untracked asset storage cleanup failed",
        untrackedFiles: 0,
      };
  }
  return {
    deletedAssets,
    deletedFiles,
    error: null,
    untrackedFiles: untracked.data.length,
  };
}
