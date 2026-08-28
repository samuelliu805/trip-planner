import { createClient } from "@/lib/supabase/server";
import type { ExportMode, ShareArtifact } from "@/lib/telemetry/events";
import { reportAuthoritativeMutationOutcome, telemetryOperationId } from "@/lib/telemetry/product";
import {
  captureServerProductEvent,
  serverProductTelemetryEnabled,
} from "@/lib/telemetry/product-server";

type SharingMutation = "publish" | "settings" | "revoke" | "export";

export async function reportSharingMutation<Result extends object>(options: {
  artifact: ShareArtifact;
  exportMode?: ExportMode;
  mutation: SharingMutation;
  operationId?: unknown;
  result: Result;
}): Promise<Result> {
  const operationId = telemetryOperationId(options.operationId);
  if (!operationId || !serverProductTelemetryEnabled()) return options.result;
  let supabaseUserId: string | undefined;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    supabaseUserId = data.user?.id;
  } catch {
    // Identity lookup cannot replace an authoritative sharing result.
  }
  const context = {
    actorType: supabaseUserId ? ("authenticated" as const) : ("anonymous" as const),
    route: "/trips/[tripId]",
    supabaseUserId,
  };
  const base = {
    operation_id: operationId,
    share_artifact: options.artifact,
    surface: options.artifact === "image" ? ("export_panel" as const) : ("share_dialog" as const),
  };
  if (options.mutation === "export") {
    const exportMode = options.exportMode ?? "new";
    return reportAuthoritativeMutationOutcome(options.result, {
      failed: (errorCode) =>
        captureServerProductEvent(
          "share_export_failed",
          { ...base, error_code: errorCode, export_mode: exportMode, share_artifact: "image" },
          context,
        ),
      succeeded: () =>
        captureServerProductEvent(
          "share_exported",
          { ...base, export_mode: exportMode, share_artifact: "image" },
          context,
        ),
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
