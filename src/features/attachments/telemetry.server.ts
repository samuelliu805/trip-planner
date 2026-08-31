import { createClient } from "@/lib/supabase/server";
import type { AttachmentTarget } from "@/lib/telemetry/events";
import { reportAuthoritativeMutationOutcome, telemetryOperationId } from "@/lib/telemetry/product";
import {
  captureServerProductEvent,
  serverProductTelemetryEnabled,
} from "@/lib/telemetry/product-server";

export async function reportAttachmentMutation<Result extends object>(options: {
  mutation: "upload" | "delete";
  operationId?: unknown;
  result: Result;
  appUserId?: string;
  target: AttachmentTarget;
}): Promise<Result> {
  const operationId = telemetryOperationId(options.operationId);
  if (!operationId || !serverProductTelemetryEnabled()) return options.result;
  let appUserId = options.appUserId;
  if (!appUserId)
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      appUserId = data.user?.id;
    } catch {
      // Identity lookup cannot replace an authoritative attachment result.
    }
  const context = {
    actorType: appUserId ? ("authenticated" as const) : ("anonymous" as const),
    route: "/trips/[tripId]",
    appUserId,
  };
  const properties = {
    attachment_target: options.target,
    operation_id: operationId,
    surface: "attachment_editor" as const,
  };
  const names =
    options.mutation === "upload"
      ? { failed: "attachment_upload_failed" as const, succeeded: "attachment_uploaded" as const }
      : { failed: "attachment_delete_failed" as const, succeeded: "attachment_deleted" as const };
  return reportAuthoritativeMutationOutcome(options.result, {
    failed: (errorCode) =>
      captureServerProductEvent(names.failed, { ...properties, error_code: errorCode }, context),
    succeeded: () => captureServerProductEvent(names.succeeded, properties, context),
  });
}
