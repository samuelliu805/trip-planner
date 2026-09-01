function validString(value, max = 500) {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function cleanupBatch(value) {
  if (!Array.isArray(value)) return null;
  return value.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      validString(entry.assetId, 64) &&
      entry.bucket === "trip-assets" &&
      Array.isArray(entry.paths) &&
      entry.paths.length <= 2 &&
      entry.paths.every((path) => validString(path)),
  )
    ? value
    : null;
}

function shareImageBatch(value) {
  if (!Array.isArray(value)) return null;
  return value.every(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      validString(entry.exportId, 64) &&
      Array.isArray(entry.paths) &&
      entry.paths.length <= 5_000 &&
      entry.paths.every((path) => validString(path, 1_000)),
  )
    ? value
    : null;
}

function untrackedBatch(value) {
  if (!Array.isArray(value) || value.length > 100) return null;
  return value.every(
    (path) =>
      validString(path) &&
      /^[^/]{1,64}\/[0-9a-f-]{36}\/(original|(thumbnail|poster)\.webp)$/.test(path),
  )
    ? value
    : null;
}

function cleanupCount(value) {
  if (Number.isInteger(value) && value >= 0) return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  return keys.length === 1 &&
    keys[0] === "count" &&
    Number.isInteger(value.count) &&
    value.count >= 0
    ? value.count
    : null;
}

function transientNetworkFailure(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  return /ECONNRESET|ETIMEDOUT|fetch failed|network.*timeout|timed?\s*out/i.test(
    `${code} ${message}`,
  );
}

async function rpcWithRetry(database, name, parameters) {
  let result;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await database.rpc(name, parameters);
    } catch (error) {
      result = { data: null, error };
    }
    if (!result.error || !transientNetworkFailure(result.error) || attempt === 2) return result;
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  return result;
}

export async function drainAssetDeletionQueue(backend, limit = 100) {
  const batchResult = await rpcWithRetry(backend.database, "asset_cleanup_batch_v2", {
    requested_limit: limit,
  });
  const batch = cleanupBatch(batchResult.data);
  if (batchResult.error || !batch)
    return {
      deletedAssets: 0,
      deletedFiles: 0,
      error: "Asset cleanup batch unavailable",
      untrackedFiles: 0,
    };

  const completed = [];
  let deletedFiles = 0;
  for (const candidate of batch) {
    try {
      await backend.storage(candidate.bucket).remove(candidate.paths);
    } catch (error) {
      await rpcWithRetry(backend.database, "fail_asset_cleanup_v1", {
        requested_error: error instanceof Error ? error.message : "Storage removal failed",
        target_asset_id: candidate.assetId,
      });
      continue;
    }
    deletedFiles += candidate.paths.length;
    completed.push(candidate.assetId);
  }

  let deletedAssets = 0;
  if (completed.length) {
    const finalized = await rpcWithRetry(backend.database, "finalize_asset_cleanup_v1", {
      target_asset_ids: completed,
    });
    const finalizedCount = cleanupCount(finalized.data);
    if (finalized.error || finalizedCount === null)
      return {
        deletedAssets: 0,
        deletedFiles,
        error: "Asset cleanup could not be finalized",
        untrackedFiles: 0,
      };
    deletedAssets = finalizedCount;
  }

  const untrackedResult = await rpcWithRetry(backend.database, "untracked_asset_storage_batch_v1", {
    requested_limit: limit,
  });
  const untracked = untrackedBatch(untrackedResult.data);
  if (untrackedResult.error || !untracked)
    return {
      deletedAssets,
      deletedFiles,
      error: "Untracked asset cleanup batch unavailable",
      untrackedFiles: 0,
    };
  try {
    if (untracked.length) await backend.storage("trip-assets").remove(untracked);
  } catch {
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
    untrackedFiles: untracked.length,
  };
}

export async function cleanupExpiredShareImages(backend, limit = 100) {
  const batchResult = await rpcWithRetry(backend.database, "expired_share_image_cleanup_batch_v1", {
    requested_limit: limit,
  });
  const batch = shareImageBatch(batchResult.data);
  if (batchResult.error || !batch)
    return { deletedFiles: 0, error: "Share-image cleanup batch unavailable", revokedImages: 0 };

  const paths = [...new Set(batch.flatMap((candidate) => candidate.paths))];
  for (let index = 0; index < paths.length; index += 100) {
    try {
      await backend.storage("share-images").remove(paths.slice(index, index + 100));
    } catch {
      return { deletedFiles: 0, error: "Share-image storage cleanup failed", revokedImages: 0 };
    }
  }

  const finalized = await rpcWithRetry(
    backend.database,
    "finalize_expired_share_image_cleanup_v1",
    { target_export_ids: batch.map((candidate) => candidate.exportId) },
  );
  const finalizedCount = cleanupCount(finalized.data);
  if (finalized.error || finalizedCount === null)
    return {
      deletedFiles: paths.length,
      error: "Share-image cleanup could not be finalized",
      revokedImages: 0,
    };
  return { deletedFiles: paths.length, error: null, revokedImages: finalizedCount };
}

export async function runCleanupJobs(backend, limit = 100) {
  const shareImages = await cleanupExpiredShareImages(backend, limit);
  const assets = await drainAssetDeletionQueue(backend, limit);
  return {
    assets,
    backlog:
      shareImages.revokedImages >= limit ||
      assets.deletedAssets >= limit ||
      assets.untrackedFiles >= limit,
    error: shareImages.error ?? assets.error,
    shareImages,
  };
}
