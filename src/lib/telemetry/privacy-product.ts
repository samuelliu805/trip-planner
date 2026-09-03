import type { TelemetryConfig } from "./config.ts";
import {
  type AuthFlow,
  type AuthMethod,
  type DurationBucket,
  featureAreaForProductEvent,
  type ItemEditorCloseReason,
  type ItemKind,
  type PlannerView,
  type ProductEventName,
  type ProductSurface,
  type TelemetryActorType,
} from "./events.ts";
import {
  advancedProductEventPropertyAllowlists,
  isAdvancedProductEvent,
} from "./privacy-product-advanced.ts";
import { normalizeTelemetryRoute, telemetryScreenForRoute } from "./routes.ts";
import { sanitizeTelemetryErrorCode } from "./privacy-values.ts";
import { addAdvancedProductValues } from "./privacy-product-values.ts";

const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const releasePattern = /^[0-9a-f]{7,64}$/i;

const actorTypes = new Set<TelemetryActorType>(["anonymous", "authenticated", "system"]);
const authFlows = new Set<AuthFlow>(["confirmation", "login", "signup"]);
const authMethods = new Set<AuthMethod>(["email_link", "google", "password", "sms"]);
const closeReasons = new Set<ItemEditorCloseReason>([
  "saved",
  "cancel",
  "close_button",
  "escape",
  "overlay",
  "browser_back",
  "navigation",
  "page_hidden",
]);
const durationBuckets = new Set<DurationBucket>(["under_30s", "30s_2m", "2m_5m", "over_5m"]);
const itemKinds = new Set<ItemKind>([
  "activity",
  "car_rental",
  "hotel",
  "meal",
  "note",
  "transport",
]);
const plannerViews = new Set<PlannerView>(["map", "matrix", "split"]);
const surfaces = new Set<ProductSurface>([
  "account",
  "auth_form",
  "global_header",
  "item_editor",
  "planner",
  "planner_app_bar",
  "trip_list",
  "ideas_options",
  "research_editor",
  "route_panel",
  "variant_controls",
  "variant_comparison",
  "share_dialog",
  "public_share",
  "attachment_editor",
  "export_panel",
]);

const common = ["actor_type", "environment", "telemetry_region", "route", "screen"] as const;
const operation = ["operation_id", "surface"] as const;
const auth = ["auth_flow", "auth_method"] as const;
const item = ["item_kind"] as const;

const foundationProductEventPropertyAllowlists = {
  auth_failed: [...common, ...operation, ...auth, "error_code", "release"],
  auth_started: [...common, ...operation, ...auth],
  auth_succeeded: [...common, ...operation, ...auth, "release"],
  item_create_failed: [...common, ...operation, ...item, "error_code", "release"],
  item_create_started: [...common, ...operation, ...item],
  item_created: [...common, ...operation, ...item, "release"],
  item_delete_failed: [...common, ...operation, ...item, "error_code", "release"],
  item_deleted: [...common, ...operation, ...item, "release"],
  item_editor_closed: [
    ...common,
    ...operation,
    ...item,
    "close_reason",
    "dirty",
    "duration_bucket",
    "editor_mode",
  ],
  item_editor_opened: [...common, ...operation, ...item, "editor_mode"],
  item_update_failed: [...common, ...operation, ...item, "error_code", "release"],
  item_updated: [...common, ...operation, ...item, "release"],
  planner_view_changed: [...common, "planner_view", "surface"],
  signed_out: [...common, ...operation, "release"],
  trip_create_failed: [...common, ...operation, "error_code", "release"],
  trip_create_started: [...common, ...operation],
  trip_created: [...common, ...operation, "release"],
  trip_delete_failed: [...common, ...operation, "error_code", "release"],
  trip_deleted: [...common, ...operation, "release"],
  trip_settings_save_failed: [...common, ...operation, "error_code", "release"],
  trip_settings_saved: [...common, ...operation, "release"],
  trip_status_changed: [...common, ...operation, "error_code", "outcome", "release", "trip_status"],
} as const;

export const productEventPropertyAllowlists = {
  ...foundationProductEventPropertyAllowlists,
  ...advancedProductEventPropertyAllowlists,
} as const satisfies Record<ProductEventName, readonly string[]>;

function member<Value extends string>(value: unknown, values: Set<Value>): Value | undefined {
  return typeof value === "string" && values.has(value as Value) ? (value as Value) : undefined;
}

function addIfAllowed(
  safe: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  key: string,
  value: unknown,
) {
  if (allowed.has(key) && value !== undefined) safe[key] = value;
}

function hasRequiredProperties(eventName: ProductEventName, safe: Record<string, unknown>) {
  if (!safe.actor_type || !safe.route || !safe.screen) return false;
  if (eventName.startsWith("auth_")) {
    if (!safe.auth_flow || !safe.auth_method) return false;
  }
  if (eventName.startsWith("item_")) {
    if (!safe.item_kind) return false;
  }
  if (eventName.endsWith("_failed") && !safe.error_code) return false;
  if (isAdvancedProductEvent(eventName)) {
    if (!safe.operation_id || !safe.surface) return false;
    if (safe.feature_area !== featureAreaForProductEvent(eventName)) return false;
    if ((safe.feature_area === "ideas" || safe.feature_area === "research") && !safe.ideas_category)
      return false;
    if (safe.feature_area === "routes" && (!safe.route_mode || !safe.route_view)) return false;
    if (
      (eventName === "variant_created" || eventName === "variant_create_failed") &&
      !safe.variant_action
    )
      return false;
    if (eventName.startsWith("variant_comparison_") && !safe.comparison_scope) return false;
    if (eventName === "variant_comparison_selection_changed" && !safe.selection_state) return false;
    if (eventName.startsWith("share_") && !safe.share_artifact) return false;
    if (eventName.includes("export") && !safe.export_mode) return false;
    if (eventName.startsWith("public_share_")) {
      if (!safe.public_view || safe.actor_type !== "anonymous") return false;
    }
    if (safe.feature_area === "attachments" && !safe.attachment_target) return false;
  }
  if (
    eventName === "auth_started" ||
    eventName === "trip_create_started" ||
    eventName === "item_create_started"
  ) {
    if (!safe.operation_id) return false;
  }
  if (eventName === "planner_view_changed" && !safe.planner_view) return false;
  if (eventName === "auth_started" && safe.surface !== "auth_form") return false;
  if (eventName === "trip_create_started" && safe.surface !== "trip_list") return false;
  if (eventName === "planner_view_changed" && safe.surface !== "planner") return false;
  if (eventName === "item_editor_opened") {
    if (!safe.editor_mode || safe.surface !== "item_editor") return false;
  }
  if (eventName === "item_editor_closed") {
    if (!safe.close_reason || typeof safe.dirty !== "boolean") return false;
    if (!safe.duration_bucket || !safe.editor_mode || safe.surface !== "item_editor") return false;
  }
  if (eventName === "trip_status_changed") {
    if (!safe.outcome || !safe.trip_status) return false;
    if (safe.outcome === "failed" && !safe.error_code) return false;
  }
  return true;
}

export function sanitizeProductEventProperties(
  eventName: ProductEventName,
  properties: Record<string, unknown>,
  config: TelemetryConfig,
): Record<string, unknown> | null {
  if (!config.enabled || !config.region) return null;
  const allowed = new Set<string>(productEventPropertyAllowlists[eventName]);
  const route = normalizeTelemetryRoute(
    typeof properties.route === "string"
      ? properties.route
      : typeof properties.$pathname === "string"
        ? properties.$pathname
        : "/unknown",
  );
  const safe: Record<string, unknown> = {
    environment: config.environment,
    route,
    screen: telemetryScreenForRoute(route),
    telemetry_region: config.region,
  };

  addIfAllowed(safe, allowed, "actor_type", member(properties.actor_type, actorTypes));
  addIfAllowed(safe, allowed, "auth_flow", member(properties.auth_flow, authFlows));
  addIfAllowed(safe, allowed, "auth_method", member(properties.auth_method, authMethods));
  addIfAllowed(safe, allowed, "close_reason", member(properties.close_reason, closeReasons));
  addIfAllowed(
    safe,
    allowed,
    "duration_bucket",
    member(properties.duration_bucket, durationBuckets),
  );
  addIfAllowed(safe, allowed, "error_code", sanitizeTelemetryErrorCode(properties.error_code));
  addAdvancedProductValues(safe, allowed, properties);
  addIfAllowed(
    safe,
    allowed,
    "editor_mode",
    member(properties.editor_mode, new Set(["create", "edit"] as const)),
  );
  addIfAllowed(safe, allowed, "item_kind", member(properties.item_kind, itemKinds));
  addIfAllowed(
    safe,
    allowed,
    "operation_id",
    typeof properties.operation_id === "string" && operationIdPattern.test(properties.operation_id)
      ? properties.operation_id
      : undefined,
  );
  addIfAllowed(
    safe,
    allowed,
    "outcome",
    member(properties.outcome, new Set(["failed", "succeeded"] as const)),
  );
  addIfAllowed(safe, allowed, "planner_view", member(properties.planner_view, plannerViews));
  addIfAllowed(
    safe,
    allowed,
    "release",
    typeof properties.release === "string" && releasePattern.test(properties.release)
      ? properties.release
      : undefined,
  );
  addIfAllowed(safe, allowed, "surface", member(properties.surface, surfaces));
  addIfAllowed(
    safe,
    allowed,
    "trip_status",
    member(properties.trip_status, new Set(["done", "open"] as const)),
  );
  if (allowed.has("dirty") && typeof properties.dirty === "boolean") safe.dirty = properties.dirty;

  return hasRequiredProperties(eventName, safe) ? safe : null;
}
