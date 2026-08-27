import type { TelemetryErrorCode } from "./events.ts";

const exceptionTypes = new Set([
  "AggregateError",
  "Error",
  "RangeError",
  "ReferenceError",
  "SyntaxError",
  "SyntheticPreviewException",
  "TypeError",
  "URIError",
]);
const mechanismTypes = new Set([
  "generic",
  "middleware",
  "onuncaughtexception",
  "onconsole",
  "onunhandledrejection",
]);
const sourceMapIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function finiteNumber(value: unknown, minimum = 0, maximum = 10_000_000) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function safeCodeLabel(value: unknown, maximumLength: number): string | undefined {
  return typeof value === "string" &&
    value.length <= maximumLength &&
    /^[A-Za-z0-9 ./_:+-]+$/.test(value)
    ? value
    : undefined;
}

function safeCodeLocation(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const withoutQuery = value
    .split(/[?#]/, 1)[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, "[id]")
    .replace(/\b(?:eyJ|phc_|phx_|phs_)[A-Za-z0-9._-]+\b/g, "[token]");
  if (!/(?:\.[cm]?[jt]sx?|\.wasm|\/_next\/)/.test(withoutQuery)) return undefined;
  return withoutQuery.slice(0, 1_000);
}

function sanitizeMechanism(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const mechanism = value as Record<string, unknown>;
  const type =
    typeof mechanism.type === "string" && mechanismTypes.has(mechanism.type)
      ? mechanism.type
      : "generic";
  return {
    ...(typeof mechanism.handled === "boolean" ? { handled: mechanism.handled } : {}),
    ...(typeof mechanism.synthetic === "boolean" ? { synthetic: mechanism.synthetic } : {}),
    type,
  };
}

export function safeSourceMapId(value: unknown): string | undefined {
  return typeof value === "string" && sourceMapIdPattern.test(value) ? value : undefined;
}

export function sanitizeExceptionList(value: unknown, errorCode: TelemetryErrorCode) {
  if (!Array.isArray(value)) return null;
  const exceptions = value.slice(0, 10).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const exception = candidate as Record<string, unknown>;
    const stacktrace = exception.stacktrace as Record<string, unknown> | undefined;
    const frames = Array.isArray(stacktrace?.frames)
      ? stacktrace.frames.slice(-100).flatMap((frame) => {
          if (!frame || typeof frame !== "object" || Array.isArray(frame)) return [];
          const source = frame as Record<string, unknown>;
          const filename = safeCodeLocation(source.filename);
          const absPath = safeCodeLocation(source.abs_path);
          const chunkId = safeSourceMapId(source.chunk_id);
          const platform =
            source.platform === "node:javascript" ? "node:javascript" : "web:javascript";
          const functionName = safeCodeLabel(source.function, 160) ?? "?";
          return [
            {
              ...(absPath ? { abs_path: absPath } : {}),
              ...(chunkId ? { chunk_id: chunkId } : {}),
              ...(finiteNumber(source.colno) !== undefined ? { colno: source.colno } : {}),
              ...(filename ? { filename } : {}),
              function: functionName,
              ...(typeof source.in_app === "boolean" ? { in_app: source.in_app } : {}),
              ...(finiteNumber(source.lineno) !== undefined ? { lineno: source.lineno } : {}),
              platform,
            },
          ];
        })
      : [];
    const type = safeCodeLabel(exception.type, 50);
    const mechanism = sanitizeMechanism(exception.mechanism);
    return [
      {
        ...(mechanism ? { mechanism } : {}),
        ...(frames.length ? { stacktrace: { frames, type: "raw" } } : {}),
        type: type && exceptionTypes.has(type) ? type : "Error",
        value: errorCode,
      },
    ];
  });
  return exceptions.length ? exceptions : null;
}
