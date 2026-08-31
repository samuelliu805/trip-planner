import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import {
  getBackendCapabilities,
  getPrivilegedRelationalDatabase,
  getStorageProvider,
} from "@/platform/composition/server";
import { serverTelemetryContext } from "@/lib/telemetry/context";
import type { CleanupProperties, TelemetryErrorCode } from "@/lib/telemetry/events";
import { logger } from "@/lib/telemetry/logger";
import { serverAnalytics } from "@/lib/telemetry/server";
import { resolveServerTelemetryConfig } from "@/lib/telemetry/config";

const cleanupBatchSchema = z.array(
  z.object({
    exportId: z.uuid(),
    paths: z.array(z.string().min(1).max(1_000)).max(5_000),
  }),
);

async function cleanupExpiredShareImages() {
  if (!getBackendCapabilities().signedUrls)
    return { deletedFiles: 0, error: "Share-image cleanup unavailable", revokedImages: 0 };
  const database = getPrivilegedRelationalDatabase();
  const storage = getStorageProvider("share-images");
  const batchResult = await database.rpc("expired_share_image_cleanup_batch_v1", {
    requested_limit: 100,
  });
  const batch = cleanupBatchSchema.safeParse(batchResult.data);
  if (batchResult.error || !batch.success) {
    return { deletedFiles: 0, error: "Share-image cleanup batch unavailable", revokedImages: 0 };
  }

  const paths = [...new Set(batch.data.flatMap((candidate) => candidate.paths))];
  for (let index = 0; index < paths.length; index += 100) {
    try {
      await storage.remove(paths.slice(index, index + 100));
    } catch {
      return { deletedFiles: 0, error: "Share-image storage cleanup failed", revokedImages: 0 };
    }
  }

  const exportIds = batch.data.map((candidate) => candidate.exportId);
  const finalizeResult = await database.rpc("finalize_expired_share_image_cleanup_v1", {
    target_export_ids: exportIds,
  });
  if (finalizeResult.error) {
    return {
      deletedFiles: paths.length,
      error: "Share-image cleanup could not be finalized",
      revokedImages: 0,
    };
  }

  return { deletedFiles: paths.length, error: null, revokedImages: finalizeResult.data };
}

function cleanupErrorCode(error: string | null): TelemetryErrorCode {
  return error?.toLowerCase().includes("storage") ? "storage_unavailable" : "database_unavailable";
}

function scheduleCleanupTelemetry(options: {
  backlog: boolean;
  outcome: "failed" | "succeeded";
  properties: CleanupProperties;
  started: CleanupProperties;
}) {
  after(async () => {
    await serverAnalytics.capture("cleanup_started", options.started);
    if (options.outcome === "failed") {
      await serverAnalytics.capture("cleanup_failed", {
        ...options.properties,
        error_code: options.properties.error_code ?? "unexpected_error",
      });
    } else {
      await serverAnalytics.capture("cleanup_succeeded", options.properties);
    }
    if (options.backlog) {
      await serverAnalytics.capture("cleanup_backlog_observed", options.properties);
    }
    await Promise.all([logger.flush(), serverAnalytics.flush()]);
  });
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const operationId = randomUUID();
  const startedAt = Date.now();
  const telemetryConfig = resolveServerTelemetryConfig();
  const context = serverTelemetryContext(telemetryConfig);
  const started: CleanupProperties = {
    ...context,
    operation_id: operationId,
    route: "/api/cron/share-image-cleanup",
  };
  logger.info({
    actor_type: "system",
    log_name: "cleanup_started",
    operation_id: operationId,
    outcome: "started",
    provider: "vercel_cron",
    route: "/api/cron/share-image-cleanup",
  });

  try {
    const [shareImages, assets] = await Promise.all([
      cleanupExpiredShareImages(),
      drainAssetDeletionQueue(100),
    ]);
    const properties: CleanupProperties = {
      ...started,
      asset_files_deleted: assets.deletedFiles,
      assets_deleted: assets.deletedAssets,
      duration_ms: Date.now() - startedAt,
      share_files_deleted: shareImages.deletedFiles,
      share_images_revoked: shareImages.revokedImages ?? 0,
      untracked_files_deleted: assets.untrackedFiles,
    };
    const backlog =
      (shareImages.revokedImages ?? 0) >= 100 ||
      assets.deletedAssets >= 100 ||
      assets.untrackedFiles >= 100;
    const error = shareImages.error ?? assets.error;
    if (error) {
      const errorCode = cleanupErrorCode(error);
      properties.error_code = errorCode;
      logger.error({
        ...properties,
        actor_type: "system",
        error_code: errorCode,
        log_name: "cleanup_failed",
        outcome: "failed",
        provider: errorCode === "storage_unavailable" ? "storage" : "supabase",
      });
      scheduleCleanupTelemetry({ backlog, outcome: "failed", properties, started });
      return Response.json({ assets, error, shareImages }, { status: 500 });
    }
    logger.info({
      ...properties,
      actor_type: "system",
      log_name: "cleanup_succeeded",
      outcome: "succeeded",
      provider: "vercel_cron",
    });
    if (backlog) {
      logger.warn({
        ...properties,
        actor_type: "system",
        log_name: "cleanup_backlog_observed",
        outcome: "observed",
        provider: "vercel_cron",
      });
    }
    scheduleCleanupTelemetry({ backlog, outcome: "succeeded", properties, started });
    return Response.json({ assets, shareImages });
  } catch (error) {
    const properties: CleanupProperties = {
      ...started,
      duration_ms: Date.now() - startedAt,
      error_code: "unexpected_error",
    };
    logger.error({
      ...properties,
      actor_type: "system",
      log_name: "cleanup_failed",
      outcome: "failed",
      provider: "application",
    });
    scheduleCleanupTelemetry({ backlog: false, outcome: "failed", properties, started });
    throw error;
  }
}
