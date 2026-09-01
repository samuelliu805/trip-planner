import "server-only";

import {
  drainAssetDeletionQueue as drainQueue,
  type CleanupBackend,
} from "../../../cloudbase/functions/shared/admin-cleanup.mjs";
import {
  getBackendCapabilities,
  getPrivilegedRelationalDatabase,
  getStorageProvider,
} from "@/platform/composition/server";

export function getAdminCleanupBackend(): CleanupBackend {
  return {
    database: getPrivilegedRelationalDatabase(),
    storage: getStorageProvider,
  } as unknown as CleanupBackend;
}

export async function drainAssetDeletionQueue(limit = 100) {
  if (!getBackendCapabilities().signedUrls)
    return {
      deletedAssets: 0,
      deletedFiles: 0,
      error: "Asset cleanup is not supported by this backend",
      untrackedFiles: 0,
    };
  return drainQueue(getAdminCleanupBackend(), limit);
}
