import type { TelemetryEnvironment, TelemetryRegion } from "./config.ts";

export const browserProductEventNames = [
  "auth_started",
  "trip_create_started",
  "planner_view_changed",
  "item_editor_opened",
  "item_editor_closed",
  "item_create_started",
  "ideas_viewed",
  "ideas_category_changed",
  "research_create_started",
  "research_apply_started",
  "research_revert_started",
  "route_calculation_started",
  "route_mode_changed",
  "route_view_changed",
  "variant_switched",
  "variant_comparison_viewed",
  "variant_comparison_selection_changed",
  "variant_comparison_summary_viewed",
  "share_publish_started",
  "share_link_copied",
  "share_link_opened",
  "public_share_viewed",
  "public_share_view_changed",
  "attachment_upload_started",
  "attachment_opened",
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
  "research_created",
  "research_create_failed",
  "research_updated",
  "research_update_failed",
  "research_deleted",
  "research_delete_failed",
  "research_applied",
  "research_apply_failed",
  "research_reverted",
  "research_revert_failed",
  "route_calculated",
  "route_calculation_failed",
  "variant_created",
  "variant_create_failed",
  "variant_updated",
  "variant_update_failed",
  "variant_deleted",
  "variant_delete_failed",
  "variant_primary_set",
  "variant_primary_set_failed",
  "share_published",
  "share_publish_failed",
  "share_settings_updated",
  "share_settings_update_failed",
  "share_revoked",
  "share_revoke_failed",
  "share_export_started",
  "share_exported",
  "share_export_failed",
  "attachment_uploaded",
  "attachment_upload_failed",
  "attachment_deleted",
  "attachment_delete_failed",
] as const;

export type BrowserProductEventName = (typeof browserProductEventNames)[number];
export type ServerProductEventName = (typeof serverProductEventNames)[number];
export type ProductEventName = BrowserProductEventName | ServerProductEventName;
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
export type FeatureArea = "ideas" | "research" | "routes" | "variants" | "sharing" | "attachments";
export type IdeasCategory = "flight" | "rental" | "stay" | "train";
export type RouteView = "day" | "overview";
export type RouteMode =
  | "walk"
  | "self_driving"
  | "taxi"
  | "rideshare"
  | "bus"
  | "subway"
  | "tram"
  | "shuttle"
  | "train"
  | "bike"
  | "flight"
  | "ferry"
  | "cable_car"
  | "motorcycle"
  | "other"
  | "mixed"
  | "unset";
export type VariantAction = "blank" | "duplicate";
export type ComparisonScope = "day" | "trip" | "summary";
export type SelectionState = "selected" | "deselected";
export type ShareArtifact = "page" | "image";
export type ExportMode = "new" | "replace";
export type PublicShareView = "overview" | "table" | "timeline";
export type AttachmentTarget = "itinerary" | "research";
export type ProductSurface =
  | "account"
  | "auth_form"
  | "global_header"
  | "item_editor"
  | "planner"
  | "planner_app_bar"
  | "trip_list"
  | "ideas_options"
  | "research_editor"
  | "route_panel"
  | "variant_controls"
  | "variant_comparison"
  | "share_dialog"
  | "public_share"
  | "attachment_editor"
  | "export_panel";

type BrowserContext = { environment: TelemetryEnvironment; telemetry_region: TelemetryRegion };
export type ProductContext = BrowserContext & {
  actor_type: TelemetryActorType;
  feature_area?: FeatureArea;
  release?: string;
  route: string;
  screen: import("./events.ts").TelemetryScreen;
};
type OperationContext = ProductContext & { operation_id?: string; surface?: ProductSurface };
type RequiredOperationContext = ProductContext & {
  feature_area: FeatureArea;
  operation_id: string;
  surface: ProductSurface;
};
type ErrorCode = import("./events.ts").TelemetryErrorCode;
type AuthProperties = OperationContext & { auth_flow: AuthFlow; auth_method: AuthMethod };
type ItemProperties = OperationContext & { item_kind: ItemKind };
type ItemEditorProperties = ItemProperties & {
  editor_mode: "create" | "edit";
  surface: "item_editor";
};
type ResearchProperties = RequiredOperationContext & { ideas_category: IdeasCategory };
type RouteProperties = RequiredOperationContext & { route_mode: RouteMode; route_view: RouteView };
type AttachmentProperties = RequiredOperationContext & { attachment_target: AttachmentTarget };

export type ProductTelemetryEventProperties = {
  auth_failed: AuthProperties & { error_code: ErrorCode };
  auth_started: AuthProperties & { operation_id: string; surface: "auth_form" };
  auth_succeeded: AuthProperties;
  item_create_failed: ItemProperties & { error_code: ErrorCode };
  item_create_started: ItemProperties & { operation_id: string };
  item_created: ItemProperties;
  item_delete_failed: ItemProperties & { error_code: ErrorCode };
  item_deleted: ItemProperties;
  item_editor_closed: ItemEditorProperties & {
    close_reason: ItemEditorCloseReason;
    dirty: boolean;
    duration_bucket: DurationBucket;
  };
  item_editor_opened: ItemEditorProperties;
  item_update_failed: ItemProperties & { error_code: ErrorCode };
  item_updated: ItemProperties;
  planner_view_changed: ProductContext & { planner_view: PlannerView; surface: "planner" };
  signed_out: OperationContext;
  trip_create_failed: OperationContext & { error_code: ErrorCode };
  trip_create_started: OperationContext & { operation_id: string; surface: "trip_list" };
  trip_created: OperationContext;
  trip_delete_failed: OperationContext & { error_code: ErrorCode };
  trip_deleted: OperationContext;
  trip_settings_save_failed: OperationContext & { error_code: ErrorCode };
  trip_settings_saved: OperationContext;
  trip_status_changed: OperationContext & {
    error_code?: ErrorCode;
    outcome: "failed" | "succeeded";
    trip_status: "done" | "open";
  };
  ideas_viewed: RequiredOperationContext & { ideas_category: IdeasCategory };
  ideas_category_changed: RequiredOperationContext & { ideas_category: IdeasCategory };
  research_create_started: ResearchProperties;
  research_apply_started: ResearchProperties;
  research_revert_started: ResearchProperties;
  research_created: ResearchProperties;
  research_create_failed: ResearchProperties & { error_code: ErrorCode };
  research_updated: ResearchProperties;
  research_update_failed: ResearchProperties & { error_code: ErrorCode };
  research_deleted: ResearchProperties;
  research_delete_failed: ResearchProperties & { error_code: ErrorCode };
  research_applied: ResearchProperties;
  research_apply_failed: ResearchProperties & { error_code: ErrorCode };
  research_reverted: ResearchProperties;
  research_revert_failed: ResearchProperties & { error_code: ErrorCode };
  route_calculation_started: RouteProperties;
  route_calculated: RouteProperties;
  route_calculation_failed: RouteProperties & { error_code: ErrorCode };
  route_mode_changed: RouteProperties;
  route_view_changed: RouteProperties;
  variant_created: RequiredOperationContext & { variant_action: VariantAction };
  variant_create_failed: RequiredOperationContext & {
    error_code: ErrorCode;
    variant_action: VariantAction;
  };
  variant_updated: RequiredOperationContext;
  variant_update_failed: RequiredOperationContext & { error_code: ErrorCode };
  variant_deleted: RequiredOperationContext;
  variant_delete_failed: RequiredOperationContext & { error_code: ErrorCode };
  variant_primary_set: RequiredOperationContext;
  variant_primary_set_failed: RequiredOperationContext & { error_code: ErrorCode };
  variant_switched: RequiredOperationContext;
  variant_comparison_viewed: RequiredOperationContext & { comparison_scope: ComparisonScope };
  variant_comparison_selection_changed: RequiredOperationContext & {
    comparison_scope: ComparisonScope;
    selection_state: SelectionState;
  };
  variant_comparison_summary_viewed: RequiredOperationContext & { comparison_scope: "summary" };
  share_publish_started: RequiredOperationContext & { share_artifact: "page" };
  share_published: RequiredOperationContext & { share_artifact: "page" };
  share_publish_failed: RequiredOperationContext & {
    error_code: ErrorCode;
    share_artifact: "page";
  };
  share_settings_updated: RequiredOperationContext & { share_artifact: "page" };
  share_settings_update_failed: RequiredOperationContext & {
    error_code: ErrorCode;
    share_artifact: "page";
  };
  share_revoked: RequiredOperationContext & { share_artifact: ShareArtifact };
  share_revoke_failed: RequiredOperationContext & {
    error_code: ErrorCode;
    share_artifact: ShareArtifact;
  };
  share_link_copied: RequiredOperationContext & { share_artifact: "page" };
  share_link_opened: RequiredOperationContext & { share_artifact: "page" };
  share_export_started: RequiredOperationContext & {
    export_mode: ExportMode;
    share_artifact: "image";
  };
  share_exported: RequiredOperationContext & { export_mode: ExportMode; share_artifact: "image" };
  share_export_failed: RequiredOperationContext & {
    error_code: ErrorCode;
    export_mode: ExportMode;
    share_artifact: "image";
  };
  public_share_viewed: RequiredOperationContext & { public_view: PublicShareView };
  public_share_view_changed: RequiredOperationContext & { public_view: PublicShareView };
  attachment_upload_started: AttachmentProperties;
  attachment_uploaded: AttachmentProperties;
  attachment_upload_failed: AttachmentProperties & { error_code: ErrorCode };
  attachment_opened: AttachmentProperties;
  attachment_deleted: AttachmentProperties;
  attachment_delete_failed: AttachmentProperties & { error_code: ErrorCode };
};
