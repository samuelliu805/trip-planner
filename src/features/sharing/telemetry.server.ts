import { createClient } from "@/lib/supabase/server";
import type { ExportMode, ShareArtifact } from "@/lib/telemetry/events";
import { reportAuthoritativeMutationOutcome, telemetryOperationId } from "@/lib/telemetry/product";
import {
  captureServerProductEvent,
  serverProductTelemetryEnabled,
} from "@/lib/telemetry/product-server";

import {
  captureAuthenticatedShareExportEvent,
  type ShareExportTelemetryCapture,
} from "./share-export-telemetry";

type SharingMutation = "publish" | "settings" | "revoke" | "export";

const captureShareExportTelemetry: ShareExportTelemetryCapture = async (
  eventName,
  properties,
  context,
) => {
  const { error_code: errorCode, ...base } = properties;
  if (eventName === "share_export_failed") {
    if (!errorCode) return;
    await captureServerProductEvent(eventName, { ...base, error_code: errorCode }, context);
    return;
  }
  if (eventName === "share_export_started") {
    await captureServerProductEvent(eventName, base, context);
    return;
  }
  await captureServerProductEvent("share_exported", base, context);
};

export async function reportShareExportStarted(options: {
  exportMode: ExportMode;
  operationId: unknown;
  appUserId: string;
}): Promise<void> {
  if (!serverProductTelemetryEnabled()) return;
  await captureAuthenticatedShareExportEvent(
    { ...options, outcome: "started" },
    captureShareExportTelemetry,
  );
}

export async function reportSharingMutation<Result extends object>(options: {
  artifact: ShareArtifact;
  exportMode?: ExportMode;
  mutation: SharingMutation;
  operationId?: unknown;
  result: Result;
  appUserId?: string;
}): Promise<Result> {
  const operationId = telemetryOperationId(options.operationId);
  if (!operationId || !serverProductTelemetryEnabled()) return options.result;
  let appUserId = options.appUserId;
  if (!appUserId) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      appUserId = data.user?.id;
    } catch {
      // Identity lookup cannot replace an authoritative sharing result.
    }
  }
  const context = {
    actorType: appUserId ? ("authenticated" as const) : ("anonymous" as const),
    route: "/trips/[tripId]",
    appUserId,
  };
  const base = {
    operation_id: operationId,
    share_artifact: options.artifact,
    surface: options.artifact === "image" ? ("export_panel" as const) : ("share_dialog" as const),
  };
  if (options.mutation === "export") {
    const exportMode = options.exportMode ?? "new";
    return reportAuthoritativeMutationOutcome(options.result, {
      failed: async (errorCode) => {
        await captureAuthenticatedShareExportEvent(
          {
            errorCode,
            exportMode,
            operationId,
            outcome: "failed",
            appUserId,
          },
          captureShareExportTelemetry,
        );
      },
      succeeded: async () => {
        await captureAuthenticatedShareExportEvent(
          { exportMode, operationId, outcome: "succeeded", appUserId },
          captureShareExportTelemetry,
        );
      },
    });
  }
  if (options.mutation === "revoke")
    return reportAuthoritativeMutationOutcome(options.result, {
      failed: (errorCode) =>
        captureServerProductEvent(
          "share_revoke_failed",
          { ...base, error_code: errorCode },
          context,
        ),
      succeeded: () => captureServerProductEvent("share_revoked", base, context),
    });
  if (options.mutation === "settings")
    return reportAuthoritativeMutationOutcome(options.result, {
      failed: (errorCode) =>
        captureServerProductEvent(
          "share_settings_update_failed",
          { ...base, error_code: errorCode, share_artifact: "page" },
          context,
        ),
      succeeded: () =>
        captureServerProductEvent(
          "share_settings_updated",
          { ...base, share_artifact: "page" },
          context,
        ),
    });
  return reportAuthoritativeMutationOutcome(options.result, {
    failed: (errorCode) =>
      captureServerProductEvent(
        "share_publish_failed",
        { ...base, error_code: errorCode, share_artifact: "page" },
        context,
      ),
    succeeded: () =>
      captureServerProductEvent("share_published", { ...base, share_artifact: "page" }, context),
  });
}
