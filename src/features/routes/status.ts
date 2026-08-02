import type { PlannerWorkspace } from "../itinerary/types.ts";

import { resolveRouteCalculationConfig } from "./plan-config.ts";
import { buildRouteConfigSignature } from "./signatures.ts";
import type { DayRoutePlan } from "./types.ts";

export type DayRouteStatus = "current" | "stale" | "updating" | "uncalculated" | "needs_edit";

export function dayRouteStatus(workspace: PlannerWorkspace, plan: DayRoutePlan): DayRouteStatus {
  const resolved = resolveRouteCalculationConfig(workspace, plan);
  if (!resolved.config) return "needs_edit";
  if (plan.calculationState === "updating") return "updating";
  if (!plan.calculation) return "uncalculated";
  return plan.calculation.config_signature === buildRouteConfigSignature(resolved.config)
    ? "current"
    : "stale";
}
