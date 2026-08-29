import type {
  AttachmentTarget,
  ComparisonScope,
  ExportMode,
  FeatureArea,
  IdeasCategory,
  PublicShareView,
  RouteMode,
  RouteView,
  SelectionState,
  ShareArtifact,
  VariantAction,
} from "./events.ts";

const featureAreas = new Set<FeatureArea>([
  "ideas",
  "research",
  "routes",
  "variants",
  "sharing",
  "attachments",
]);
const ideasCategories = new Set<IdeasCategory>(["flight", "rental", "stay", "train"]);
const routeModes = new Set<RouteMode>([
  "walk",
  "self_driving",
  "taxi",
  "rideshare",
  "bus",
  "subway",
  "tram",
  "shuttle",
  "train",
  "bike",
  "flight",
  "ferry",
  "cable_car",
  "motorcycle",
  "other",
  "mixed",
  "unset",
]);
const routeViews = new Set<RouteView>(["day", "overview"]);
const comparisonScopes = new Set<ComparisonScope>(["day", "trip", "summary"]);
const selectionStates = new Set<SelectionState>(["selected", "deselected"]);
const variantActions = new Set<VariantAction>(["blank", "duplicate"]);
const shareArtifacts = new Set<ShareArtifact>(["page", "image"]);
const exportModes = new Set<ExportMode>(["new", "replace"]);
const publicShareViews = new Set<PublicShareView>(["overview", "table", "timeline"]);
const attachmentTargets = new Set<AttachmentTarget>(["itinerary", "research"]);

function member<Value extends string>(value: unknown, values: Set<Value>): Value | undefined {
  return typeof value === "string" && values.has(value as Value) ? (value as Value) : undefined;
}

export function addAdvancedProductValues(
  safe: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  properties: Record<string, unknown>,
) {
  const add = (key: string, value: unknown) => {
    if (allowed.has(key) && value !== undefined) safe[key] = value;
  };
  add("feature_area", member(properties.feature_area, featureAreas));
  add("ideas_category", member(properties.ideas_category, ideasCategories));
  add("route_mode", member(properties.route_mode, routeModes));
  add("route_view", member(properties.route_view, routeViews));
  add("comparison_scope", member(properties.comparison_scope, comparisonScopes));
  add("selection_state", member(properties.selection_state, selectionStates));
  add("variant_action", member(properties.variant_action, variantActions));
  add("share_artifact", member(properties.share_artifact, shareArtifacts));
  add("export_mode", member(properties.export_mode, exportModes));
  add("public_view", member(properties.public_view, publicShareViews));
  add("attachment_target", member(properties.attachment_target, attachmentTargets));
}
