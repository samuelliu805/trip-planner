import type { TelemetryErrorCode } from "./events.ts";

const safeErrorCodes = new Set<TelemetryErrorCode>([
  "authentication_failed",
  "conflict",
  "database_unavailable",
  "forbidden",
  "invalid_input",
  "request_aborted",
  "storage_unavailable",
  "synthetic_preview_exception",
  "telemetry_delivery_failed",
  "timeout",
  "unexpected_error",
]);

export function sanitizeTelemetryErrorCode(value: unknown): TelemetryErrorCode | undefined {
  return typeof value === "string" && safeErrorCodes.has(value as TelemetryErrorCode)
    ? (value as TelemetryErrorCode)
    : undefined;
}
