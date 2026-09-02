import { createRequire } from "node:module";

import { runCleanupJobs } from "../shared/admin-cleanup.mjs";

// CloudBase's Node 18 Event Function loader enters through CommonJS. Loading the SDK through the
// ESM export selects a `.js` bundle that Node 18 treats as CommonJS and rejects before the handler
// starts. Select the packages' explicit CommonJS conditions at this runtime boundary instead.
const require = createRequire(import.meta.url);
const { default: nodeAdapter } = require("@cloudbase/adapter-node");
const cloudbase = require("@cloudbase/js-sdk");

cloudbase.useAdapters(nodeAdapter);

function required(name, value) {
  if (value?.trim()) return value.trim();
  throw new Error(`Missing required cleanup runtime configuration: ${name}`);
}

function adminBackend() {
  const app = cloudbase.init({
    accessKey: required(
      "CLOUDBASE_APIKEY",
      process.env.CLOUDBASE_APIKEY ?? process.env.CLOUDBASE_API_KEY,
    ),
    auth: { detectSessionInUrl: false },
    env: required("TCB_ENV", process.env.TCB_ENV ?? process.env.CLOUDBASE_ENV_ID),
    persistence: "none",
    region: required("CLOUDBASE_REGION", process.env.CLOUDBASE_REGION),
  });
  return {
    database: app.rdb(),
    storage(bucket) {
      return {
        async remove(paths) {
          const requested = [...new Set(paths)];
          const result = await app.storage.from(bucket).remove(requested);
          const removed = result.data;
          if (
            result.error ||
            !Array.isArray(removed) ||
            removed.length !== requested.length ||
            removed.some(
              (object) =>
                !object || object.bucket_id !== bucket || !requested.includes(object.name),
            )
          ) {
            throw new Error("Storage removal failed");
          }
        },
      };
    },
  };
}

export async function main() {
  const result = await runCleanupJobs(adminBackend(), 100);
  if (result.error) {
    const codes = {
      "Asset cleanup batch unavailable": "CLEANUP_ASSET_BATCH_UNAVAILABLE",
      "Asset cleanup could not be finalized": "CLEANUP_ASSET_FINALIZE_UNAVAILABLE",
      "Share-image cleanup batch unavailable": "CLEANUP_SHARE_IMAGE_BATCH_UNAVAILABLE",
      "Share-image cleanup could not be finalized": "CLEANUP_SHARE_IMAGE_FINALIZE_UNAVAILABLE",
      "Share-image storage cleanup failed": "CLEANUP_SHARE_IMAGE_STORAGE_UNAVAILABLE",
      "Untracked asset cleanup batch unavailable": "CLEANUP_UNTRACKED_BATCH_UNAVAILABLE",
      "Untracked asset storage cleanup failed": "CLEANUP_UNTRACKED_STORAGE_UNAVAILABLE",
    };
    throw Object.assign(new Error(result.error), {
      code: codes[result.error] ?? "CLEANUP_FAILED",
    });
  }
  return {
    assets: {
      deletedAssets: result.assets.deletedAssets,
      deletedFiles: result.assets.deletedFiles,
      untrackedFiles: result.assets.untrackedFiles,
    },
    backlog: result.backlog,
    shareImages: {
      deletedFiles: result.shareImages.deletedFiles,
      revokedImages: result.shareImages.revokedImages,
    },
    status: "ok",
  };
}
