import type { TelemetryEnvironment, TelemetryRegion } from "./config.ts";

export const telemetryEventNames = [
  "$pageview",
  "$web_vitals",
  "auth_started",
  "auth_succeeded",
  "auth_failed",
  "signed_out",
  "trip_create_started",
  "trip_created",
  "trip_create_failed",
  "trip_settings_saved",
  "trip_settings_save_failed",
  "trip_status_changed",
  "trip_deleted",
  "trip_delete_failed",
  "planner_view_changed",
  "item_editor_opened",
  "item_editor_closed",
  "item_create_started",
  "item_created",
  "item_create_failed",
  "item_updated",
  "item_update_failed",
  "item_deleted",
  "item_delete_failed",
  "cleanup_started",
  "cleanup_succeeded",
  "cleanup_failed",
  "cleanup_backlog_observed",
] as const;

export type TelemetryEventName = (typeof telemetryEventNames)[number];
export const browserProductEventNames = [
  "auth_started",
  "trip_create_started",
  "planner_view_changed",
  "item_editor_opened",
  "item_editor_closed",
  "item_create_started",
] as const;
export const serverProductEventNames = [
  "auth_succeeded",
  "auth_failed",
  "signed_out",
  "trip_created",
  "trip_create_failed",
  "trip_settings_saved",
  "trip_settings_save_failed",
  "trip_status_changed",
  "trip_deleted",
  "trip_delete_failed",
  "item_created",
  "item_create_failed",
  "item_updated",
  "item_update_failed",
  "item_deleted",
  "item_delete_failed",
] as const;

export type BrowserProductEventName = (typeof browserProductEventNames)[number];
export type ServerProductEventName = (typeof serverProductEventNames)[number];
export type ProductEventName = BrowserProductEventName | ServerProductEventName;
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

export type IdeasCategory = "flight" | "rental" | "stay" | "train";
export type WebVitalName = "CLS" | "FCP" | "INP" | "LCP" | "TTFB";
export type WebVitalRating = "good" | "needs-improvement" | "poor";
export type TelemetryActorType = "anonymous" | "authenticated" | "system";
export type AuthMethod = "email_link" | "google" | "password";
export type AuthFlow = "confirmation" | "login" | "signup";
export type DurationBucket = "under_30s" | "30s_2m" | "2m_5m" | "over_5m";
export type ItemEditorCloseReason =
  | "saved"
  | "cancel"
  | "close_button"
  | "escape"
  | "overlay"
  | "browser_back"
  | "navigation"
  | "page_hidden";
export type ItemKind = "activity" | "car_rental" | "hotel" | "meal" | "note" | "transport";
export type PlannerView = "map" | "matrix" | "split";
export type ProductSurface =
  | "account"
  | "auth_form"
  | "global_header"
  | "item_editor"
  | "planner"
  | "planner_app_bar"
  | "trip_list";

type BrowserContext = {
  environment: TelemetryEnvironment;
  telemetry_region: TelemetryRegion;
};

export type ProductContext = BrowserContext & {
  actor_type: TelemetryActorType;
  release?: string;
  route: string;
  screen: TelemetryScreen;
};

type OperationContext = ProductContext & {
  operation_id?: string;
  surface?: ProductSurface;
};

export type PageviewProperties = BrowserContext & {
  $current_url: string;
  $pathname: string;
  $referrer?: string;
  ideas_category?: IdeasCategory;
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

type AuthProperties = OperationContext & {
  auth_flow: AuthFlow;
  auth_method: AuthMethod;
};

type ItemProperties = OperationContext & { item_kind: ItemKind };
type ItemEditorProperties = ItemProperties & {
  editor_mode: "create" | "edit";
  surface: "item_editor";
};

export type TelemetryEventProperties = {
  $pageview: PageviewProperties;
  $web_vitals: WebVitalsProperties;
  auth_failed: AuthProperties & { error_code: TelemetryErrorCode };
  auth_started: AuthProperties & { operation_id: string; surface: "auth_form" };
  auth_succeeded: AuthProperties;
  cleanup_backlog_observed: CleanupProperties;
  cleanup_failed: CleanupProperties & { error_code: TelemetryErrorCode };
  cleanup_started: CleanupProperties;
  cleanup_succeeded: CleanupProperties;
  item_create_failed: ItemProperties & { error_code: TelemetryErrorCode };
  item_create_started: ItemProperties & { operation_id: string };
  item_created: ItemProperties;
  item_delete_failed: ItemProperties & { error_code: TelemetryErrorCode };
  item_deleted: ItemProperties;
  item_editor_closed: ItemEditorProperties & {
    close_reason: ItemEditorCloseReason;
    dirty: boolean;
    duration_bucket: DurationBucket;
  };
  item_editor_opened: ItemEditorProperties;
  item_update_failed: ItemProperties & { error_code: TelemetryErrorCode };
  item_updated: ItemProperties;
  planner_view_changed: ProductContext & { planner_view: PlannerView; surface: "planner" };
  signed_out: OperationContext;
  trip_create_failed: OperationContext & { error_code: TelemetryErrorCode };
  trip_create_started: OperationContext & { operation_id: string; surface: "trip_list" };
  trip_created: OperationContext;
  trip_delete_failed: OperationContext & { error_code: TelemetryErrorCode };
  trip_deleted: OperationContext;
  trip_settings_save_failed: OperationContext & { error_code: TelemetryErrorCode };
  trip_settings_saved: OperationContext;
  trip_status_changed: OperationContext & {
    error_code?: TelemetryErrorCode;
    outcome: "failed" | "succeeded";
    trip_status: "done" | "open";
  };
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
] as const;

export type TelemetryLogName = (typeof telemetryLogNames)[number];
export type TelemetryLogLevel = "error" | "info" | "warn";
export type TelemetryLogProvider =
  "application" | "posthog" | "storage" | "supabase" | "vercel_cron";
export type TelemetryLogOutcome = "captured" | "failed" | "observed" | "started" | "succeeded";

export type TelemetryLogFields = {
  actor_type?: "anonymous" | "authenticated" | "system";
  asset_files_deleted?: number;
  assets_deleted?: number;
  duration_ms?: number;
  environment?: TelemetryEnvironment;
  error_code?: TelemetryErrorCode;
  log_name: TelemetryLogName;
  operation_id?: string;
  outcome: TelemetryLogOutcome;
  provider: TelemetryLogProvider;
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

export const telemetryEventRegistry = {
  $pageview: true,
  $web_vitals: true,
  auth_failed: true,
  auth_started: true,
  auth_succeeded: true,
  cleanup_backlog_observed: true,
  cleanup_failed: true,
  cleanup_started: true,
  cleanup_succeeded: true,
  item_create_failed: true,
  item_create_started: true,
  item_created: true,
  item_delete_failed: true,
  item_deleted: true,
  item_editor_closed: true,
  item_editor_opened: true,
  item_update_failed: true,
  item_updated: true,
  planner_view_changed: true,
  signed_out: true,
  trip_create_failed: true,
  trip_create_started: true,
  trip_created: true,
  trip_delete_failed: true,
  trip_deleted: true,
  trip_settings_save_failed: true,
  trip_settings_saved: true,
  trip_status_changed: true,
} satisfies Record<TelemetryEventName, true>;
