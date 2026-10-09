import type { PlannerWorkspace } from "../itinerary/types";
import type { DayRoutePlan, SaveDayRoutePlanInput } from "./types";

export const replacePlan = (workspace: PlannerWorkspace | undefined, plan: DayRoutePlan) =>
  workspace
    ? {
        ...workspace,
        routePlans: [
          ...workspace.routePlans.filter(
            (current) =>
              current.id !== plan.id &&
              !(current.day_id === plan.day_id && current.variant_id === plan.variant_id),
          ),
          workspace.routePlans.find(
            (current) =>
              current.day_id === plan.day_id &&
              current.variant_id === plan.variant_id &&
              current.version > plan.version,
          ) ?? plan,
        ],
      }
    : workspace;

export const optimisticPlan = (
  workspace: PlannerWorkspace,
  input: SaveDayRoutePlanInput,
): DayRoutePlan => {
  const existing = workspace.routePlans.find(
    (plan) => plan.day_id === input.dayId && plan.variant_id === input.variantId,
  );
  const now = new Date().toISOString();
  const planId = existing?.id ?? `optimistic-route-plan-${input.operationId}`;
  const stops = input.itemIds.map((itemId, index) => ({
    created_at: now,
    id: `optimistic-route-stop-${input.operationId}-${index}`,
    item_id: itemId,
    plan_id: planId,
    position: index + 1,
    updated_at: now,
  }));
  return {
    calculation: existing?.calculation ?? null,
    created_at: existing?.created_at ?? now,
    day_id: input.dayId,
    id: planId,
    legs: input.legModes.map((mode, index) => ({
      created_at: now,
      from_stop_id: stops[index].id,
      id: `optimistic-route-leg-${input.operationId}-${index}`,
      mode,
      plan_id: planId,
      position: index + 1,
      to_stop_id: stops[index + 1].id,
      updated_at: now,
    })),
    stops,
    trip_id: input.tripId,
    updated_at: now,
    variant_id: input.variantId,
    version: (existing?.version ?? 0) + 1,
  };
};
