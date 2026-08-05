import type { PlannerWorkspace } from "../itinerary/types.ts";

import {
  plannerRouteConfigProjection,
  resolveRouteCalculationConfigFromProjection,
  type RouteConfigPlanInput,
  type RouteConfigProjectionInput,
} from "./plan-config.ts";
import { buildRouteConfigSignature } from "./signatures.ts";
import type { DayRoutePlan } from "./types.ts";

export type DayRouteStatus = "current" | "stale" | "updating" | "uncalculated" | "needs_edit";

export type RouteStatusPlanInput = RouteConfigPlanInput & {
  calculation: Pick<DayRoutePlan["calculation"] & object, "config_signature"> | null;
  calculationState?: "updating";
};

export function dayRouteStatusFromProjection(
  projection: RouteConfigProjectionInput,
  plan: RouteStatusPlanInput,
): DayRouteStatus {
  const resolved = resolveRouteCalculationConfigFromProjection(projection, plan);
  if (!resolved.config) return "needs_edit";
  if (plan.calculationState === "updating") return "updating";
  if (!plan.calculation) return "uncalculated";
  return plan.calculation.config_signature === buildRouteConfigSignature(resolved.config)
    ? "current"
    : "stale";
}

export function dayRouteStatus(workspace: PlannerWorkspace, plan: DayRoutePlan): DayRouteStatus {
  return dayRouteStatusFromProjection(plannerRouteConfigProjection(workspace), plan);
}
