import type { TelemetryErrorCode } from "./events.ts";

export const syntheticPreviewExceptionFingerprint =
  "trip-planner-web:synthetic-preview-exception:v1" as const;

export type SyntheticPreviewExceptionFingerprint = typeof syntheticPreviewExceptionFingerprint;

const databaseCodes = new Set(["23505", "42501", "PGRST000", "PGRST001", "PGRST002"]);
const safeErrorNames = new Set([
  "AggregateError",
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "SyntheticPreviewException",
  "TypeError",
  "URIError",
]);

export class SafeTelemetryError extends Error {
  readonly telemetryCode: TelemetryErrorCode;

  constructor(telemetryCode: TelemetryErrorCode) {
    super(telemetryCode);
    this.name =
      telemetryCode === "synthetic_preview_exception"
        ? "SyntheticPreviewException"
        : "TelemetryError";
    this.telemetryCode = telemetryCode;
  }
}

export function safeErrorCode(error: unknown): TelemetryErrorCode {
  if (error instanceof SafeTelemetryError) return error.telemetryCode;
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return "request_aborted";
  }

  if (error && typeof error === "object") {
    const candidate = error as { code?: unknown; name?: unknown };
    if (candidate.name === "AbortError") return "request_aborted";
    if (candidate.name === "TimeoutError") return "timeout";
    if (candidate.name === "ZodError") return "invalid_input";
    if (typeof candidate.code === "string") {
      if (candidate.code === "22023") return "invalid_input";
      if (candidate.code === "42501") return "forbidden";
      if (candidate.code === "23505") return "conflict";
      if (databaseCodes.has(candidate.code) || candidate.code.startsWith("PGRST")) {
        return "database_unavailable";
      }
    }
  }
  return "unexpected_error";
}

export function safeAuthErrorCode(error: unknown): TelemetryErrorCode {
  const code = safeErrorCode(error);
  return code === "request_aborted" || code === "timeout" || code === "invalid_input"
    ? code
    : "authentication_failed";
}

export function safeMutationErrorCode(error: unknown): TelemetryErrorCode {
  const direct = safeErrorCode(error);
  if (direct !== "unexpected_error") return direct;
  const message =
    typeof error === "string"
      ? error.toLowerCase()
      : error instanceof Error
        ? error.message.toLowerCase()
        : "";
  if (/permission|sign in|unauthori[sz]ed|forbidden/.test(message)) return "forbidden";
  if (/already|changed|conflict|duplicate/.test(message)) return "conflict";
  if (/invalid|choose|enter|required|cannot|only one|not supported|legacy/.test(message)) {
    return "invalid_input";
  }
  if (/database|postgres|query|unavailable/.test(message)) return "database_unavailable";
  return "unexpected_error";
}

function safeStackLine(line: string): string | null {
  const withoutQuery = line.replace(/([?#]).*?(?=\)?(?:\s|$))/g, "");
  const withoutSecrets = withoutQuery
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\b(?:eyJ|phc_|phx_|phs_)[A-Za-z0-9._-]+\b/g, "[token]")
    .slice(0, 1_000);
  return /^\s*at\s/.test(withoutSecrets) ? withoutSecrets : null;
}

export function sanitizedError(error: unknown, code = safeErrorCode(error)): Error {
  const safe = new Error(code);
  const original = error instanceof Error ? error : null;
  safe.name = original && safeErrorNames.has(original.name) ? original.name : "Error";
  const frames = original?.stack?.split("\n").slice(1).map(safeStackLine).filter(Boolean) ?? [];
  safe.stack = [`${safe.name}: ${code}`, ...frames.slice(0, 80)].join("\n");
  return safe;
}

const capturedErrors = new WeakSet<object>();

export function markExceptionCaptured(error: unknown): boolean {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return true;
  if (capturedErrors.has(error)) return false;
  capturedErrors.add(error);
  return true;
}
