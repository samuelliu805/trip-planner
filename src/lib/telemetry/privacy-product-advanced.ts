import type { ProductEventName } from "./events.ts";

const common = ["actor_type", "environment", "telemetry_region", "route", "screen"] as const;
const advanced = [...common, "feature_area", "operation_id", "surface"] as const;
const failure = ["error_code", "release"] as const;
const success = ["release"] as const;
const research = ["ideas_category"] as const;
const route = ["route_mode", "route_view"] as const;
const share = ["share_artifact"] as const;
const attachment = ["attachment_target"] as const;

export const advancedProductEventPropertyAllowlists = {
  ideas_viewed: [...advanced, ...research],
  ideas_category_changed: [...advanced, ...research],
  research_create_started: [...advanced, ...research],
  research_apply_started: [...advanced, ...research],
  research_revert_started: [...advanced, ...research],
  research_created: [...advanced, ...research, ...success],
  research_create_failed: [...advanced, ...research, ...failure],
  research_updated: [...advanced, ...research, ...success],
  research_update_failed: [...advanced, ...research, ...failure],
  research_deleted: [...advanced, ...research, ...success],
  research_delete_failed: [...advanced, ...research, ...failure],
  research_applied: [...advanced, ...research, ...success],
  research_apply_failed: [...advanced, ...research, ...failure],
  research_reverted: [...advanced, ...research, ...success],
  research_revert_failed: [...advanced, ...research, ...failure],
  route_calculation_started: [...advanced, ...route],
  route_calculated: [...advanced, ...route, ...success],
  route_calculation_failed: [...advanced, ...route, ...failure],
  route_mode_changed: [...advanced, ...route],
  route_view_changed: [...advanced, ...route],
  variant_created: [...advanced, "variant_action", ...success],
  variant_create_failed: [...advanced, "variant_action", ...failure],
  variant_updated: [...advanced, ...success],
  variant_update_failed: [...advanced, ...failure],
  variant_deleted: [...advanced, ...success],
  variant_delete_failed: [...advanced, ...failure],
  variant_primary_set: [...advanced, ...success],
  variant_primary_set_failed: [...advanced, ...failure],
  variant_switched: [...advanced],
  variant_comparison_viewed: [...advanced, "comparison_scope"],
  variant_comparison_selection_changed: [...advanced, "comparison_scope", "selection_state"],
  variant_comparison_summary_viewed: [...advanced, "comparison_scope"],
  share_publish_started: [...advanced, ...share],
  share_published: [...advanced, ...share, ...success],
  share_publish_failed: [...advanced, ...share, ...failure],
  share_settings_updated: [...advanced, ...share, ...success],
  share_settings_update_failed: [...advanced, ...share, ...failure],
  share_revoked: [...advanced, ...share, ...success],
  share_revoke_failed: [...advanced, ...share, ...failure],
  share_link_copied: [...advanced, ...share],
  share_link_opened: [...advanced, ...share],
  share_export_started: [...advanced, ...share, "export_mode"],
  share_exported: [...advanced, ...share, "export_mode", ...success],
  share_export_failed: [...advanced, ...share, "export_mode", ...failure],
  public_share_viewed: [...advanced, "public_view"],
  public_share_view_changed: [...advanced, "public_view"],
  attachment_upload_started: [...advanced, ...attachment],
  attachment_uploaded: [...advanced, ...attachment, ...success],
  attachment_upload_failed: [...advanced, ...attachment, ...failure],
  attachment_opened: [...advanced, ...attachment],
  attachment_deleted: [...advanced, ...attachment, ...success],
  attachment_delete_failed: [...advanced, ...attachment, ...failure],
} as const satisfies Partial<Record<ProductEventName, readonly string[]>>;

export function isAdvancedProductEvent(eventName: ProductEventName): boolean {
  return eventName in advancedProductEventPropertyAllowlists;
}
