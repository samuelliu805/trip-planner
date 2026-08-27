import { logger } from "@/lib/telemetry/logger";
import { serverAnalytics } from "@/lib/telemetry/server";
import { handleTelemetrySmokeRequest } from "@/lib/telemetry/smoke";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const response = await handleTelemetrySmokeRequest(request, {
    async captureException(error) {
      return serverAnalytics.captureException(error, {
        errorCode: "synthetic_preview_exception",
        provider: "posthog",
        route: "/api/internal/telemetry-smoke",
      });
    },
    env: {
      NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
      NEXT_PUBLIC_TELEMETRY_ENABLED: process.env.NEXT_PUBLIC_TELEMETRY_ENABLED,
      NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: process.env.NEXT_PUBLIC_TELEMETRY_ENVIRONMENT,
      NEXT_PUBLIC_TELEMETRY_PROVIDER: process.env.NEXT_PUBLIC_TELEMETRY_PROVIDER,
      NEXT_PUBLIC_TELEMETRY_REGION: process.env.NEXT_PUBLIC_TELEMETRY_REGION,
      TELEMETRY_SMOKE_TEST_ENABLED: process.env.TELEMETRY_SMOKE_TEST_ENABLED,
      TELEMETRY_SMOKE_TEST_TOKEN: process.env.TELEMETRY_SMOKE_TEST_TOKEN,
      VERCEL_ENV: process.env.VERCEL_ENV,
    },
    flushLogs: () => logger.flush(),
    logExceptionDeliveryFailure() {
      logger.warn({
        actor_type: "system",
        error_code: "telemetry_delivery_failed",
        log_name: "posthog_exception_delivery_failed",
        outcome: "failed",
        provider: "posthog",
        route: "/api/internal/telemetry-smoke",
      });
    },
    logWarning() {
      logger.warn({
        actor_type: "system",
        log_name: "telemetry_smoke_warning",
        outcome: "observed",
        provider: "application",
        route: "/api/internal/telemetry-smoke",
      });
    },
  });
  return response;
}
