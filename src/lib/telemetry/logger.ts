import { resolveServerTelemetryConfig, type TelemetryConfig } from "./config.ts";
import { isNodeTelemetryRuntime, telemetryRelease } from "./context.ts";
import {
  telemetryLogNames,
  type TelemetryErrorCode,
  type TelemetryLogFields,
  type TelemetryLogLevel,
} from "./events.ts";
import { normalizeTelemetryRoute } from "./routes.ts";

export type StructuredLogRecord = TelemetryLogFields & {
  environment: "production" | "preview";
  level: TelemetryLogLevel;
  region: "global";
  runtime: "nodejs";
  service: "trip-planner-web";
  timestamp: string;
};

export type TelemetryLogForwarder = {
  emit: (record: StructuredLogRecord) => void;
  flush: () => Promise<void>;
};

export type TelemetryLogForwarderLoader = () => Promise<TelemetryLogForwarder | null>;

const identifierPattern = /^[A-Za-z0-9_-]{8,128}$/;
const operationIdPattern = /^[0-9a-f-]{36}$/i;
const traceIdPattern = /^[0-9a-f]{16,32}$/i;
const errorCodes = new Set<TelemetryErrorCode>([
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
const forwardedInfoLogs = new Set(["cleanup_succeeded"]);
const forwardedWarnLogs = new Set(["cleanup_backlog_observed", "telemetry_smoke_warning"]);
const logOutcomes = new Set(["captured", "failed", "observed", "started", "succeeded"]);
const logProviders = new Set(["application", "posthog", "storage", "supabase", "vercel_cron"]);

let activeForwarder: TelemetryLogForwarder | null = null;

export function registerTelemetryLogForwarder(forwarder: TelemetryLogForwarder): void {
  activeForwarder = forwarder;
}

async function loadPostHogLogForwarder(): Promise<TelemetryLogForwarder | null> {
  if (!isNodeTelemetryRuntime()) return null;
  const { getPostHogLogForwarder } = await import("./otel-logs.server.ts");
  return getPostHogLogForwarder();
}

function boundedInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1_000_000
    ? Math.trunc(value)
    : undefined;
}

function shouldForward(record: StructuredLogRecord): boolean {
  if (record.level === "error") return true;
  if (record.level === "warn") return forwardedWarnLogs.has(record.log_name);
  return forwardedInfoLogs.has(record.log_name);
}

function buildRecord(
  level: TelemetryLogLevel,
  fields: TelemetryLogFields,
  config: TelemetryConfig,
  now: () => Date,
): StructuredLogRecord | null {
  if (
    !config.enabled ||
    config.environment === "development" ||
    config.region !== "global" ||
    !telemetryLogNames.includes(fields.log_name) ||
    !logOutcomes.has(fields.outcome) ||
    !logProviders.has(fields.provider)
  ) {
    return null;
  }
  const record: StructuredLogRecord = {
    environment: config.environment,
    level,
    log_name: fields.log_name,
    outcome: fields.outcome,
    provider: fields.provider,
    region: "global",
    runtime: "nodejs",
    service: "trip-planner-web",
    timestamp: now().toISOString(),
  };
  if (
    fields.actor_type === "anonymous" ||
    fields.actor_type === "authenticated" ||
    fields.actor_type === "system"
  ) {
    record.actor_type = fields.actor_type;
  }
  if (fields.route) record.route = normalizeTelemetryRoute(fields.route);
  if (fields.operation_id && operationIdPattern.test(fields.operation_id)) {
    record.operation_id = fields.operation_id;
  }
  if (fields.request_id && identifierPattern.test(fields.request_id))
    record.request_id = fields.request_id;
  if (fields.trace_id && traceIdPattern.test(fields.trace_id)) record.trace_id = fields.trace_id;
  if (fields.error_code && errorCodes.has(fields.error_code)) record.error_code = fields.error_code;
  const release = telemetryRelease();
  if (release) record.release = release;
  for (const key of [
    "asset_files_deleted",
    "assets_deleted",
    "duration_ms",
    "share_files_deleted",
    "share_images_revoked",
    "untracked_files_deleted",
  ] as const) {
    const value = boundedInteger(fields[key]);
    if (value !== undefined) record[key] = value;
  }
  return record;
}

export function createStructuredLogger(
  options: {
    config?: TelemetryConfig;
    forwarder?: TelemetryLogForwarder;
    loadForwarder?: TelemetryLogForwarderLoader;
    now?: () => Date;
    write?: (line: string) => void;
  } = {},
) {
  const config = options.config ?? resolveServerTelemetryConfig();
  const now = options.now ?? (() => new Date());
  const write =
    options.write ??
    ((line: string) => {
      console.log(line.endsWith("\n") ? line.slice(0, -1) : line);
    });
  const pendingForwards = new Set<Promise<void>>();
  let loadedForwarder: Promise<TelemetryLogForwarder | null> | null = null;

  async function resolveForwarder(): Promise<TelemetryLogForwarder | null> {
    if (options.forwarder) return options.forwarder;
    if (activeForwarder) return activeForwarder;
    loadedForwarder ??= (options.loadForwarder ?? loadPostHogLogForwarder)().catch(() => null);
    return loadedForwarder;
  }

  function forward(record: StructuredLogRecord): void {
    const immediate = options.forwarder ?? activeForwarder;
    if (immediate) {
      try {
        immediate.emit(record);
      } catch {
        // Remote log delivery is best effort.
      }
      return;
    }

    const pending = resolveForwarder()
      .then((forwarder) => {
        forwarder?.emit(record);
      })
      .catch(() => undefined);
    pendingForwards.add(pending);
    void pending.then(
      () => pendingForwards.delete(pending),
      () => pendingForwards.delete(pending),
    );
  }

  function emit(level: TelemetryLogLevel, fields: TelemetryLogFields): void {
    if (!isNodeTelemetryRuntime()) return;
    const record = buildRecord(level, fields, config, now);
    if (!record) return;
    try {
      write(`${JSON.stringify(record)}\n`);
    } catch {
      // Application behavior cannot depend on stdout availability.
    }
    if (shouldForward(record)) forward(record);
  }

  return {
    error: (fields: TelemetryLogFields) => emit("error", fields),
    async flush() {
      try {
        const forwarder = await resolveForwarder();
        await Promise.allSettled([...pendingForwards]);
        await forwarder?.flush();
      } catch {
        // Serverless responses must not fail because a log exporter did.
      }
    },
    info: (fields: TelemetryLogFields) => emit("info", fields),
    warn: (fields: TelemetryLogFields) => emit("warn", fields),
  };
}

export const logger = createStructuredLogger();
