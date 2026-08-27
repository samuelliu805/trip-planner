import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

import { resolveServerTelemetryConfig, type TelemetryConfig } from "./config.ts";
import { isNodeTelemetryRuntime, telemetryRelease } from "./context.ts";
import {
  registerTelemetryLogForwarder,
  type StructuredLogRecord,
  type TelemetryLogForwarder,
} from "./logger.ts";

const postHogLogsEndpoint = "https://us.i.posthog.com/i/v1/logs";

type OTelLogProvider = {
  emit: (record: StructuredLogRecord) => void;
  forceFlush: () => Promise<void>;
};

export type PostHogLogProviderOptions = {
  exporter: {
    headers: { Authorization: string; "Content-Type": "application/json" };
    url: typeof postHogLogsEndpoint;
  };
  resourceAttributes: {
    "deployment.environment": "preview" | "production";
    "service.name": "trip-planner-web";
    "service.version"?: string;
    "telemetry.region": "global";
  };
};

type CreatePostHogLogForwarderOptions = {
  config?: TelemetryConfig;
  createProvider?: (options: PostHogLogProviderOptions) => OTelLogProvider;
  release?: string;
  runtimeEnv?: Partial<Record<"NEXT_RUNTIME", string>>;
};

function severityNumber(record: StructuredLogRecord): SeverityNumber {
  if (record.level === "error") return SeverityNumber.ERROR;
  if (record.level === "warn") return SeverityNumber.WARN;
  return SeverityNumber.INFO;
}

export function postHogLogProviderOptions(
  config: TelemetryConfig,
  release = telemetryRelease(),
): PostHogLogProviderOptions | null {
  if (
    !config.enabled ||
    !config.projectToken ||
    config.environment === "development" ||
    config.host !== "https://us.i.posthog.com" ||
    config.region !== "global"
  ) {
    return null;
  }
  return {
    exporter: {
      headers: {
        Authorization: `Bearer ${config.projectToken}`,
        "Content-Type": "application/json",
      },
      url: postHogLogsEndpoint,
    },
    resourceAttributes: {
      "deployment.environment": config.environment,
      "service.name": "trip-planner-web",
      ...(release ? { "service.version": release } : {}),
      "telemetry.region": "global",
    },
  };
}

function createOTelProvider(options: PostHogLogProviderOptions): OTelLogProvider {
  const exporter = new OTLPLogExporter(options.exporter);
  const provider = new LoggerProvider({
    processors: [
      new BatchLogRecordProcessor({
        exportTimeoutMillis: 5_000,
        exporter,
        maxExportBatchSize: 20,
        maxQueueSize: 100,
        scheduledDelayMillis: 500,
      }),
    ],
    resource: resourceFromAttributes(options.resourceAttributes),
  });
  const otelLogger = provider.getLogger("trip-planner-web");
  return {
    emit(record) {
      otelLogger.emit({
        attributes: record,
        body: record.log_name,
        eventName: record.log_name,
        severityNumber: severityNumber(record),
        severityText: record.level.toUpperCase(),
        timestamp: new Date(record.timestamp),
      });
    },
    async forceFlush() {
      await provider.forceFlush({ timeoutMillis: 5_000 });
    },
  };
}

export function createPostHogLogForwarder(
  options: CreatePostHogLogForwarderOptions = {},
): TelemetryLogForwarder | null {
  if (!isNodeTelemetryRuntime(options.runtimeEnv)) return null;
  const setup = postHogLogProviderOptions(
    options.config ?? resolveServerTelemetryConfig(),
    options.release,
  );
  if (!setup) return null;
  try {
    const provider = (options.createProvider ?? createOTelProvider)(setup);
    return {
      emit(record) {
        provider.emit(record);
      },
      async flush() {
        await provider.forceFlush();
      },
    };
  } catch {
    return null;
  }
}

let initialized = false;
let singleton: TelemetryLogForwarder | null = null;

export function getPostHogLogForwarder(): TelemetryLogForwarder | null {
  if (!initialized) {
    initialized = true;
    singleton = createPostHogLogForwarder();
  }
  return singleton;
}

export function registerPostHogLogExporter(): void {
  const forwarder = getPostHogLogForwarder();
  if (forwarder) registerTelemetryLogForwarder(forwarder);
}
