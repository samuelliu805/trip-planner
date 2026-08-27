import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";

import { resolveServerTelemetryConfig } from "./config";
import { isNodeTelemetryRuntime, telemetryRelease } from "./context";
import {
  registerTelemetryLogForwarder,
  type StructuredLogRecord,
  type TelemetryLogForwarder,
} from "./logger";

let provider: LoggerProvider | null = null;

function severityNumber(record: StructuredLogRecord): SeverityNumber {
  if (record.level === "error") return SeverityNumber.ERROR;
  if (record.level === "warn") return SeverityNumber.WARN;
  return SeverityNumber.INFO;
}

export function registerPostHogLogExporter(): void {
  if (provider || !isNodeTelemetryRuntime()) return;
  const config = resolveServerTelemetryConfig();
  if (!config.enabled || !config.host || !config.projectToken || config.region !== "global") return;

  const exporter = new OTLPLogExporter({
    headers: {
      Authorization: `Bearer ${config.projectToken}`,
      "Content-Type": "application/json",
    },
    url: `${config.host}/i/v1/logs`,
  });
  provider = new LoggerProvider({
    processors: [
      new BatchLogRecordProcessor({
        exportTimeoutMillis: 5_000,
        exporter,
        maxExportBatchSize: 20,
        maxQueueSize: 100,
        scheduledDelayMillis: 500,
      }),
    ],
    resource: resourceFromAttributes({
      "deployment.environment": config.environment,
      "deployment.environment.name": config.environment,
      region: "global",
      "service.name": "trip-planner-web",
      ...(telemetryRelease() ? { "service.version": telemetryRelease() } : {}),
    }),
  });
  const otelLogger = provider.getLogger("trip-planner-web");
  const forwarder: TelemetryLogForwarder = {
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
    async flush() {
      await provider?.forceFlush({ timeoutMillis: 5_000 });
    },
  };
  registerTelemetryLogForwarder(forwarder);
}
