import type { TelemetryConfig } from "./config.ts";
import {
  telemetryEventRegistry,
  type TelemetryErrorCode,
  type TelemetryEventName,
  type WebVitalName,
  type WebVitalRating,
} from "./events.ts";
import {
  ideasCategoryForPath,
  normalizeTelemetryRoute,
  sanitizedCurrentUrl,
  sanitizedReferrer,
  telemetryScreenForRoute,
} from "./routes.ts";
import { sanitizeExceptionList } from "./privacy-exceptions.ts";
import { sanitizePersonProperties } from "./privacy-person.ts";

export type ProviderCaptureEvent = {
  _originatedFromCaptureException?: boolean;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
  distinctId?: string;
  event: string;
  properties?: Record<string, unknown>;
  timestamp?: Date;
  uuid?: string;
};

const identifierPattern = /^(?:tpv1_[0-9a-f]{64}|[A-Za-z0-9:_-]{8,200})$/;
const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const eventIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const releasePattern = /^[0-9a-f]{7,64}$/i;
const safeLabelPattern = /^[A-Za-z0-9 ./_:+-]{1,100}$/;
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
const webVitalNames = new Set<WebVitalName>(["CLS", "FCP", "INP", "LCP", "TTFB"]);
const webVitalRatings = new Set<WebVitalRating>(["good", "needs-improvement", "poor"]);

export function isProhibitedTelemetryKey(key: string): boolean {
  return /(?:authorization|avatar|body|booking|cookie|coordinate|display.?name|email|filename|latitude|longitude|notes?|phone|price|query|raw.?user|signed.?url|storage.?key|title|token|url$|user.?id)/i.test(
    key,
  );
}

function safeString(value: unknown, maximumLength = 100): string | undefined {
  return typeof value === "string" && value.length <= maximumLength && safeLabelPattern.test(value)
    ? value
    : undefined;
}

function safeIdentifier(value: unknown): string | undefined {
  return typeof value === "string" && identifierPattern.test(value) ? value : undefined;
}

function finiteNumber(value: unknown, minimum = -1_000_000_000, maximum = 1_000_000_000) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : undefined;
}

function boundedCount(value: unknown): number | undefined {
  const candidate = finiteNumber(value, 0, 1_000_000);
  return candidate === undefined ? undefined : Math.trunc(candidate);
}

function safeErrorCode(value: unknown): TelemetryErrorCode | undefined {
  return typeof value === "string" && safeErrorCodes.has(value as TelemetryErrorCode)
    ? (value as TelemetryErrorCode)
    : undefined;
}

function coreProperties(properties: Record<string, unknown>, config: TelemetryConfig) {
  const safe: Record<string, unknown> = {
    $geoip_disable: true,
    environment: config.environment,
    telemetry_region: config.region,
    token: config.projectToken,
  };

  for (const key of [
    "$anon_distinct_id",
    "$device_id",
    "$insert_id",
    "$session_id",
    "$window_id",
    "distinct_id",
  ]) {
    const value = safeIdentifier(properties[key]);
    if (value) safe[key] = value;
  }
  for (const key of [
    "$browser",
    "$browser_version",
    "$device_type",
    "$lib",
    "$lib_version",
    "$os",
    "$os_version",
  ]) {
    const value = safeString(properties[key]);
    if (value) safe[key] = value;
  }
  for (const key of ["$screen_height", "$screen_width", "$viewport_height", "$viewport_width"]) {
    const value = finiteNumber(properties[key], 0, 100_000);
    if (value !== undefined) safe[key] = value;
  }
  for (const key of ["$is_identified", "$process_person_profile"]) {
    if (typeof properties[key] === "boolean") safe[key] = properties[key];
  }
  return safe;
}

function routeContext(properties: Record<string, unknown>) {
  const source =
    typeof properties.$pathname === "string"
      ? properties.$pathname
      : typeof properties.$current_url === "string"
        ? properties.$current_url
        : typeof properties.route === "string"
          ? properties.route
          : "/unknown";
  const route = normalizeTelemetryRoute(source);
  return {
    $current_url: sanitizedCurrentUrl(
      typeof properties.$current_url === "string" ? properties.$current_url : route,
    ),
    $pathname: route,
    ideas_category: ideasCategoryForPath(source),
    route,
    screen: telemetryScreenForRoute(route),
  };
}

function sanitizePageview(properties: Record<string, unknown>, config: TelemetryConfig) {
  const context = routeContext(properties);
  const referrer = sanitizedReferrer(
    typeof properties.$referrer === "string" ? properties.$referrer : "",
  );
  return {
    ...coreProperties(properties, config),
    $current_url: context.$current_url,
    $pathname: context.$pathname,
    ...(referrer ? { $referrer: referrer } : {}),
    ...(context.ideas_category ? { ideas_category: context.ideas_category } : {}),
    screen: context.screen,
  };
}

function sanitizeWebVitals(properties: Record<string, unknown>, config: TelemetryConfig) {
  const metricName = properties.metric_name;
  const metricRating = properties.metric_rating;
  const metricValue = finiteNumber(properties.metric_value, 0);
  const metricDelta = finiteNumber(properties.metric_delta);
  if (
    typeof metricName !== "string" ||
    !webVitalNames.has(metricName as WebVitalName) ||
    typeof metricRating !== "string" ||
    !webVitalRatings.has(metricRating as WebVitalRating) ||
    metricValue === undefined ||
    metricDelta === undefined
  ) {
    return null;
  }
  const context = routeContext(properties);
  return {
    ...coreProperties(properties, config),
    $current_url: context.$current_url,
    $pathname: context.$pathname,
    [`$web_vitals_${metricName}_value`]: metricValue,
    metric_delta: metricDelta,
    metric_name: metricName,
    metric_rating: metricRating,
    metric_value: metricValue,
    screen: context.screen,
  };
}

function sanitizeException(properties: Record<string, unknown>, config: TelemetryConfig) {
  const errorCode = safeErrorCode(properties.error_code) ?? "unexpected_error";
  const exceptionList = sanitizeExceptionList(properties.$exception_list, errorCode);
  if (!exceptionList) return null;
  const context = routeContext(properties);
  return {
    ...coreProperties(properties, config),
    $current_url: context.$current_url,
    $exception_level: properties.$exception_level === "fatal" ? "fatal" : "error",
    $exception_list: exceptionList,
    $pathname: context.$pathname,
    error_code: errorCode,
    ...(properties.provider === "application" ||
    properties.provider === "posthog" ||
    properties.provider === "storage" ||
    properties.provider === "supabase"
      ? { provider: properties.provider }
      : {}),
    ...(typeof properties.release === "string" && releasePattern.test(properties.release)
      ? { release: properties.release }
      : {}),
    route: context.route,
    runtime: properties.runtime === "nodejs" ? "nodejs" : "browser",
    screen: context.screen,
  };
}

function sanitizeCleanup(properties: Record<string, unknown>, config: TelemetryConfig) {
  const operationId = properties.operation_id;
  if (typeof operationId !== "string" || !operationIdPattern.test(operationId)) return null;
  const safe: Record<string, unknown> = {
    ...coreProperties(properties, config),
    operation_id: operationId,
    region: "global",
    route: "/api/cron/share-image-cleanup",
    runtime: "nodejs",
  };
  for (const key of [
    "asset_files_deleted",
    "assets_deleted",
    "duration_ms",
    "share_files_deleted",
    "share_images_revoked",
    "untracked_files_deleted",
  ]) {
    const value = boundedCount(properties[key]);
    if (value !== undefined) safe[key] = value;
  }
  const errorCode = safeErrorCode(properties.error_code);
  if (errorCode) safe.error_code = errorCode;
  if (typeof properties.release === "string" && releasePattern.test(properties.release)) {
    safe.release = properties.release;
  }
  return safe;
}

export function sanitizeTelemetryProperties(
  eventName: TelemetryEventName | "$exception" | "$identify",
  properties: Record<string, unknown>,
  config: TelemetryConfig,
): Record<string, unknown> | null {
  if (!config.enabled || !config.projectToken || !config.region) return null;
  if (eventName === "$pageview") return sanitizePageview(properties, config);
  if (eventName === "$web_vitals") return sanitizeWebVitals(properties, config);
  if (eventName === "$exception") return sanitizeException(properties, config);
  if (eventName === "$identify") return coreProperties(properties, config);
  return sanitizeCleanup(properties, config);
}

export function sanitizeProviderEvent(
  event: ProviderCaptureEvent | null,
  config: TelemetryConfig,
): ProviderCaptureEvent | null {
  if (
    !event ||
    (!telemetryEventRegistry[event.event as TelemetryEventName] &&
      event.event !== "$exception" &&
      event.event !== "$identify")
  ) {
    return null;
  }
  const properties = sanitizeTelemetryProperties(
    event.event as TelemetryEventName | "$exception" | "$identify",
    event.properties ?? {},
    config,
  );
  if (!properties) return null;
  const personProperties =
    event.event === "$identify" ? sanitizePersonProperties(event.$set) : undefined;
  if (event.event === "$identify" && !personProperties) return null;
  const distinctId = safeIdentifier(event.distinctId);
  return {
    ...(event._originatedFromCaptureException === true
      ? { _originatedFromCaptureException: true }
      : {}),
    ...(personProperties ? { $set: personProperties } : {}),
    ...(distinctId ? { distinctId } : {}),
    event: event.event,
    properties,
    ...(event.timestamp instanceof Date ? { timestamp: event.timestamp } : {}),
    ...(typeof event.uuid === "string" && eventIdPattern.test(event.uuid)
      ? { uuid: event.uuid }
      : {}),
  };
}
