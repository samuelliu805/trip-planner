import type { ExportMode, TelemetryErrorCode } from "../../lib/telemetry/events.ts";
import { telemetryOperationId } from "../../lib/telemetry/product.ts";

const appUserIdPattern = /^(?=[^\u0000-\u001f\u007f]{1,128}$)(?=.*(?:\d|:)).+$/;

export type ShareExportTelemetryCapture = (
  eventName: "share_export_started" | "share_exported" | "share_export_failed",
  properties: {
    error_code?: TelemetryErrorCode;
    export_mode: ExportMode;
    operation_id: string;
    share_artifact: "image";
    surface: "export_panel";
  },
  context: {
    actorType: "authenticated";
    route: "/trips/[tripId]";
    appUserId: string;
  },
) => Promise<void> | void;

export async function captureAuthenticatedShareExportEvent(
  options: {
    errorCode?: TelemetryErrorCode;
    exportMode: ExportMode;
    operationId: unknown;
    outcome: "started" | "succeeded" | "failed";
    appUserId?: string;
  },
  capture: ShareExportTelemetryCapture,
): Promise<boolean> {
  const operationId = telemetryOperationId(options.operationId);
  if (
    !operationId ||
    !options.appUserId ||
    !appUserIdPattern.test(options.appUserId) ||
    (options.outcome === "failed" && !options.errorCode)
  )
    return false;
  const properties = {
    ...(options.outcome === "failed" && options.errorCode ? { error_code: options.errorCode } : {}),
    export_mode: options.exportMode,
    operation_id: operationId,
    share_artifact: "image" as const,
    surface: "export_panel" as const,
  };
  const eventName =
    options.outcome === "started"
      ? "share_export_started"
      : options.outcome === "succeeded"
        ? "share_exported"
        : "share_export_failed";
  try {
    await capture(eventName, properties, {
      actorType: "authenticated",
      route: "/trips/[tripId]",
      appUserId: options.appUserId,
    });
    return true;
  } catch {
    return false;
  }
}
