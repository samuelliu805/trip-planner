import { resolveServerTelemetryConfig } from "./config";
import { isNodeTelemetryRuntime, serverTelemetryContext } from "./context";
import { markExceptionCaptured, safeErrorCode, sanitizedError } from "./errors";
import type {
  ServerTelemetryEventName,
  TelemetryErrorCode,
  TelemetryEventProperties,
} from "./events";
import { systemAnalyticsId } from "./identity";
import type { PostHogServerAdapter } from "./posthog-server.adapter";
import { normalizeTelemetryRoute } from "./routes";

let adapterPromise: Promise<PostHogServerAdapter | null> | null = null;

export type ExceptionDeliveryResult = "captured" | "disabled" | "duplicate" | "failed";

async function serverAdapter(): Promise<PostHogServerAdapter | null> {
  const config = resolveServerTelemetryConfig();
  if (!config.enabled || !isNodeTelemetryRuntime()) return null;
  adapterPromise ??= import("./posthog-server.adapter").then(({ getPostHogServerAdapter }) =>
    getPostHogServerAdapter(config),
  );
  return adapterPromise;
}

export const serverAnalytics = {
  async capture<EventName extends ServerTelemetryEventName>(
    eventName: EventName,
    properties: TelemetryEventProperties[EventName],
  ): Promise<void> {
    try {
      const config = resolveServerTelemetryConfig();
      const adapter = await serverAdapter();
      if (!adapter || !config.enabled) return;
      adapter.capture(eventName, systemAnalyticsId(config.environment), {
        ...serverTelemetryContext(config),
        ...properties,
      });
    } catch {
      // Cleanup and application work must not depend on analytics delivery.
    }
  },
  async captureException(
    error: unknown,
    context: {
      analyticsId?: string;
      errorCode?: TelemetryErrorCode;
      provider?: "application" | "posthog" | "storage" | "supabase";
      route: string;
    },
  ): Promise<ExceptionDeliveryResult> {
    if (!markExceptionCaptured(error)) return "duplicate";
    try {
      const config = resolveServerTelemetryConfig();
      const adapter = await serverAdapter();
      if (!adapter || !config.enabled) return "disabled";
      const code = context.errorCode ?? safeErrorCode(error);
      const authenticated = /^tpv1_[0-9a-f]{64}$/.test(context.analyticsId ?? "");
      const analyticsId = authenticated
        ? context.analyticsId!
        : systemAnalyticsId(config.environment);
      await adapter.captureException(sanitizedError(error, code), analyticsId, {
        ...serverTelemetryContext(config),
        $pathname: normalizeTelemetryRoute(context.route),
        actor_type: authenticated ? "authenticated" : "system",
        error_code: code,
        provider: context.provider ?? "application",
        route: normalizeTelemetryRoute(context.route),
      });
      return "captured";
    } catch {
      // Exception reporting is isolated from the request that failed.
      return "failed";
    }
  },
  async flush(): Promise<void> {
    try {
      await (await serverAdapter())?.flush();
    } catch {
      // A serverless response must never fail while flushing telemetry.
    }
  },
};
