import type { TelemetryErrorCode } from "./events.ts";

const databaseCodes = new Set(["23505", "42501", "PGRST000", "PGRST001", "PGRST002"]);
const safeErrorNames = new Set([
  "AggregateError",
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "TypeError",
  "URIError",
]);

export class SafeTelemetryError extends Error {
  readonly telemetryCode: TelemetryErrorCode;

  constructor(telemetryCode: TelemetryErrorCode) {
    super(telemetryCode);
    this.name = "TelemetryError";
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
      if (candidate.code === "42501") return "forbidden";
      if (candidate.code === "23505") return "conflict";
      if (databaseCodes.has(candidate.code) || candidate.code.startsWith("PGRST")) {
        return "database_unavailable";
      }
    }
  }
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
