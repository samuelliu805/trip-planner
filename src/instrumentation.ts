import type { Instrumentation } from "next";

import { safeErrorCode } from "@/lib/telemetry/errors";
import { logger } from "@/lib/telemetry/logger";
import { normalizeTelemetryRoute } from "@/lib/telemetry/routes";
import { serverAnalytics } from "@/lib/telemetry/server";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerPostHogLogExporter } = await import("@/lib/telemetry/otel-logs.server");
  registerPostHogLogExporter();
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const route = normalizeTelemetryRoute(context.routePath || request.path);
  const errorCode = safeErrorCode(error);
  logger.error({
    actor_type: "system",
    error_code: errorCode,
    log_name: "server_exception",
    outcome: "captured",
    provider: "application",
    route,
  });
  await serverAnalytics.captureException(error, { errorCode, route });
  await logger.flush();
};
