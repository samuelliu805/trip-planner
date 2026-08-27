import type { TelemetryConfig } from "./config.ts";
import { syntheticPreviewExceptionFingerprint } from "./errors.ts";
import type { TelemetryErrorCode } from "./events.ts";
import type { ProviderCaptureEvent } from "./privacy.ts";
import { safeSourceMapId, sanitizeExceptionList } from "./privacy-exceptions.ts";
import { normalizeTelemetryRoute } from "./routes.ts";

const analyticsIdPattern = /^(?:tpv1_[0-9a-f]{64}|system:trip-planner-web:(?:preview|production))$/;
const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const releasePattern = /^[0-9a-f]{7,64}$/i;
const safeErrorCodes = new Set<TelemetryErrorCode>([
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
const safeProviders = new Set(["application", "posthog", "storage", "supabase"]);

export function sanitizeServerExceptionEvent(
  event: ProviderCaptureEvent | null,
  config: TelemetryConfig,
): ProviderCaptureEvent | null {
  if (
    !event ||
    event.event !== "$exception" ||
    !config.enabled ||
    !config.projectToken ||
    config.environment === "development" ||
    config.region !== "global"
  ) {
    return null;
  }

  const properties = event.properties ?? {};
  const errorCode =
    typeof properties.error_code === "string" &&
    safeErrorCodes.has(properties.error_code as TelemetryErrorCode)
      ? (properties.error_code as TelemetryErrorCode)
      : "unexpected_error";
  const exceptionList = sanitizeExceptionList(properties.$exception_list, errorCode);
  if (!exceptionList) return null;
  const route = normalizeTelemetryRoute(
    typeof properties.route === "string"
      ? properties.route
      : typeof properties.$pathname === "string"
        ? properties.$pathname
        : "/unknown",
  );
  const releaseId = safeSourceMapId(properties.$release_id);
  const release =
    typeof properties.release === "string" && releasePattern.test(properties.release)
      ? properties.release
      : undefined;
  const distinctId =
    typeof event.distinctId === "string" && analyticsIdPattern.test(event.distinctId)
      ? event.distinctId
      : undefined;
  const exceptionFingerprint =
    config.environment === "preview" &&
    errorCode === "synthetic_preview_exception" &&
    route === "/api/internal/telemetry-smoke" &&
    properties.$exception_fingerprint === syntheticPreviewExceptionFingerprint
      ? syntheticPreviewExceptionFingerprint
      : undefined;

  return {
    // posthog-node removes this internal marker before before_send runs. The
    // server adapter exposes no generic $exception capture path, so rebuilding
    // the event here remains restricted to the official exception API.
    _originatedFromCaptureException: true,
    ...(distinctId ? { distinctId } : {}),
    event: "$exception",
    properties: {
      ...(exceptionFingerprint ? { $exception_fingerprint: exceptionFingerprint } : {}),
      $exception_level: properties.$exception_level === "fatal" ? "fatal" : "error",
      $exception_list: exceptionList,
      $geoip_disable: true,
      $pathname: route,
      ...(releaseId ? { $release_id: releaseId } : {}),
      actor_type: properties.actor_type === "authenticated" ? "authenticated" : "system",
      environment: config.environment,
      error_code: errorCode,
      ...(typeof properties.provider === "string" && safeProviders.has(properties.provider)
        ? { provider: properties.provider }
        : { provider: "application" }),
      ...(release ? { release } : {}),
      route,
      runtime: "nodejs",
      telemetry_region: "global",
      token: config.projectToken,
    },
    ...(event.timestamp instanceof Date ? { timestamp: event.timestamp } : {}),
    ...(typeof event.uuid === "string" && eventIdPattern.test(event.uuid)
      ? { uuid: event.uuid }
      : {}),
  };
}
