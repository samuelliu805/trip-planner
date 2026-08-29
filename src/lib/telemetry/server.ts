import { resolveServerTelemetryConfig, type TelemetryConfig } from "./config.ts";
import { isNodeTelemetryRuntime, serverTelemetryContext } from "./context.ts";
import {
  markExceptionCaptured,
  safeErrorCode,
  sanitizedError,
  syntheticPreviewExceptionFingerprint,
  type SyntheticPreviewExceptionFingerprint,
} from "./errors.ts";
import type {
  ServerTelemetryEventName,
  TelemetryErrorCode,
  TelemetryEventProperties,
} from "./events.ts";
import { systemAnalyticsId } from "./identity.ts";
import type { PostHogServerAdapter } from "./posthog-server.adapter.ts";
import { normalizeTelemetryRoute } from "./routes.ts";

let adapterPromise: Promise<PostHogServerAdapter | null> | null = null;

export type ExceptionDeliveryResult = "captured" | "disabled" | "duplicate" | "failed";

async function serverAdapter(): Promise<PostHogServerAdapter | null> {
  const config = resolveServerTelemetryConfig();
  if (!config.enabled || !isNodeTelemetryRuntime()) return null;
  adapterPromise ??= import("./posthog-server.adapter.ts").then(({ getPostHogServerAdapter }) =>
    getPostHogServerAdapter(config),
  );
  return adapterPromise;
}

type ServerCaptureDependencies = {
  resolveAdapter: () => Promise<PostHogServerAdapter | null>;
  resolveConfig: () => TelemetryConfig;
};

export function createServerCaptureBoundary(dependencies: Partial<ServerCaptureDependencies> = {}) {
  const resolveAdapter = dependencies.resolveAdapter ?? serverAdapter;
  const resolveConfig = dependencies.resolveConfig ?? resolveServerTelemetryConfig;
  return async function capture<EventName extends ServerTelemetryEventName>(
    eventName: EventName,
    properties: TelemetryEventProperties[EventName],
    options: { analyticsId?: string } = {},
  ): Promise<void> {
    try {
      const config = resolveConfig();
      const adapter = await resolveAdapter();
      if (!adapter || !config.enabled) return;
      const authenticated = /^tpv1_[0-9a-f]{64}$/.test(options.analyticsId ?? "");
      await adapter.capture(
        eventName,
        authenticated ? options.analyticsId! : systemAnalyticsId(config.environment),
        {
          ...serverTelemetryContext(config),
          ...properties,
          ...(!authenticated ? { $process_person_profile: false } : {}),
        },
      );
    } catch {
      // Cleanup and application work must not depend on analytics delivery.
    }
  };
}

export const serverAnalytics = {
  capture: createServerCaptureBoundary(),
  async captureException(
    error: unknown,
    context: {
      analyticsId?: string;
      errorCode?: TelemetryErrorCode;
      exceptionFingerprint?: SyntheticPreviewExceptionFingerprint;
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
      const exceptionFingerprint =
        context.exceptionFingerprint === syntheticPreviewExceptionFingerprint
          ? syntheticPreviewExceptionFingerprint
          : undefined;
      await adapter.captureException(sanitizedError(error, code), analyticsId, {
        ...serverTelemetryContext(config),
        ...(exceptionFingerprint ? { $exception_fingerprint: exceptionFingerprint } : {}),
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
