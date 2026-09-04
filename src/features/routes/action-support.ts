import { getPlannerWorkspace } from "@/features/itinerary/data";
import { MapsProviderConfigurationError } from "@/lib/providers/maps/provider";
import { RouteProviderError } from "@/lib/providers/routes/errors";

import type { CalculationResult } from "./calculator";
import type { DayRoutePlan } from "./types";

export function routeActionError(error: unknown) {
  if (error instanceof MapsProviderConfigurationError) return error.message;
  if (error instanceof RouteProviderError) return error.message;
  if (error instanceof Error) {
    if (/permission|row-level security|owner/i.test(error.message))
      return "Only the trip owner can configure or calculate routes.";
    return error.message;
  }
  return "The day route could not be changed.";
}

export async function loadRouteWorkspace(tripId: string, variantId: string) {
  const result = await getPlannerWorkspace(tripId, variantId);
  if (!result.data) throw new Error(result.error ?? "The planner could not be loaded.");
  return result.data;
}

export function withCalculatedRoute(plan: DayRoutePlan, calculated: CalculationResult) {
  const calculation =
    calculated.cache === "full" && plan.calculation
      ? plan.calculation
      : {
          calculatedLegs: calculated.legs,
          computed_at: new Date().toISOString(),
          config_signature: calculated.configSignature,
          plan_id: plan.id,
          provider_schema_version: "routes-v1",
          total_distance_meters: calculated.totalDistanceMeters,
          total_duration_seconds: calculated.totalDurationSeconds,
        };
  return { ...plan, calculation } satisfies DayRoutePlan;
}
