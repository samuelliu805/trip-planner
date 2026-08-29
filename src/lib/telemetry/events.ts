import type { TelemetryEnvironment, TelemetryRegion } from "./config.ts";
import {
  browserProductEventNames,
  serverProductEventNames,
  type BrowserProductEventName,
  type ProductTelemetryEventProperties,
} from "./events-product.ts";

export * from "./events-product.ts";
export * from "./feature-area.ts";

export const telemetryEventNames = [
  "$pageview",
  "$web_vitals",
  ...browserProductEventNames,
  ...serverProductEventNames,
  "cleanup_started",
  "cleanup_succeeded",
  "cleanup_failed",
  "cleanup_backlog_observed",
] as const;
export type TelemetryEventName = (typeof telemetryEventNames)[number];
export type BrowserTelemetryEventName = "$pageview" | "$web_vitals" | BrowserProductEventName;
export type ServerTelemetryEventName = Exclude<TelemetryEventName, BrowserTelemetryEventName>;

export type TelemetryScreen =
  | "account"
  | "ideas_options"
  | "landing"
  | "login"
  | "public_share"
  | "signup"
  | "trip_plan"
  | "trips_list"
  | "unknown";
export type WebVitalName = "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
export type WebVitalRating = "good" | "needs-improvement" | "poor";
type BrowserContext = { environment: TelemetryEnvironment; telemetry_region: TelemetryRegion };
export type PageviewProperties = BrowserContext & {
  $current_url: string;
  $pathname: string;
  $referrer?: string;
  ideas_category?: import("./events-product.ts").IdeasCategory;
  screen: TelemetryScreen;
};
export type WebVitalsProperties = BrowserContext & {
  $current_url: string;
  $pathname: string;
  $web_vitals_CLS_value?: number;
  $web_vitals_FCP_value?: number;
  $web_vitals_INP_value?: number;
  $web_vitals_LCP_value?: number;
  $web_vitals_TTFB_value?: number;
  metric_delta: number;
  metric_name: WebVitalName;
  metric_rating: WebVitalRating;
  metric_value: number;
  screen: TelemetryScreen;
};
export type CleanupProperties = {
  asset_files_deleted?: number;
  assets_deleted?: number;
  duration_ms?: number;
  environment: TelemetryEnvironment;
  error_code?: TelemetryErrorCode;
  operation_id: string;
  release?: string;
  region: "global";
  route: "/api/cron/share-image-cleanup";
  runtime: "nodejs";
  share_files_deleted?: number;
  share_images_revoked?: number;
  untracked_files_deleted?: number;
};
export type TelemetryEventProperties = ProductTelemetryEventProperties & {
  $pageview: PageviewProperties;
  $web_vitals: WebVitalsProperties;
  cleanup_backlog_observed: CleanupProperties;
  cleanup_failed: CleanupProperties & { error_code: TelemetryErrorCode };
  cleanup_started: CleanupProperties;
  cleanup_succeeded: CleanupProperties;
};
export type TelemetryErrorCode =
  | "authentication_failed"
  | "conflict"
  | "database_unavailable"
  | "forbidden"
  | "invalid_input"
  | "request_aborted"
  | "storage_unavailable"
  | "synthetic_preview_exception"
  | "telemetry_delivery_failed"
  | "timeout"
  | "unexpected_error";

export const telemetryLogNames = [
  "cleanup_started",
  "cleanup_succeeded",
  "cleanup_failed",
  "cleanup_backlog_observed",
  "server_exception",
  "telemetry_smoke_warning",
  "posthog_exception_delivery_failed",
  "public_template_resolution_warning",
] as const;
export type TelemetryLogName = (typeof telemetryLogNames)[number];
export type TelemetryLogLevel = "error" | "info" | "warn";
export type TelemetryLogProvider =
  "application" | "posthog" | "storage" | "supabase" | "vercel_cron";
export type TelemetryLogOutcome = "captured" | "failed" | "observed" | "started" | "succeeded";
export type PublicTemplateResolutionDiagnosticCode =
  | "public_template_disabled"
  | "public_template_invalid_artifact"
  | "public_template_unknown_persisted";
export type PublicTemplateResolutionSource = "fallback" | "legacy_query" | "persisted";
export type TelemetryLogFields = {
  actor_type?: "anonymous" | "authenticated" | "system";
  asset_files_deleted?: number;
  assets_deleted?: number;
  duration_ms?: number;
  environment?: TelemetryEnvironment;
  error_code?: TelemetryErrorCode;
  fallback_used?: boolean;
  log_name: TelemetryLogName;
  operation_id?: string;
  outcome: TelemetryLogOutcome;
  provider: TelemetryLogProvider;
  public_template_diagnostic_code?: PublicTemplateResolutionDiagnosticCode;
  public_template_source?: PublicTemplateResolutionSource;
  region?: "global";
  release?: string;
  request_id?: string;
  route?: string;
  runtime?: "nodejs";
  share_files_deleted?: number;
  share_images_revoked?: number;
  trace_id?: string;
  untracked_files_deleted?: number;
};
export type PersonProperties = {
  account_state: "authenticated";
  app_role?: "member";
  environment: TelemetryEnvironment;
  locale: "en" | "zh-CN";
  telemetry_region: TelemetryRegion;
};

export const telemetryEventRegistry = Object.fromEntries(
  telemetryEventNames.map((eventName) => [eventName, true]),
) as Record<TelemetryEventName, true>;
