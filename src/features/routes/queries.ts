"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { plannerQueryKey } from "@/features/itinerary/queries";
import { requireData } from "@/features/itinerary/query-cache";
import type { PlannerWorkspace } from "@/features/itinerary/types";

import { calculateDayRoute, clearDayRoutePlan, saveDayRoutePlan } from "./actions";
import type {
  CalculateDayRouteInput,
  ClearDayRouteInput,
  DayRoutePlan,
  SaveDayRoutePlanInput,
} from "./types";

const replacePlan = (workspace: PlannerWorkspace | undefined, plan: DayRoutePlan) =>
  workspace
    ? {
        ...workspace,
        routePlans: [
          ...workspace.routePlans.filter(
            (current) =>
              current.id !== plan.id &&
              !(current.day_id === plan.day_id && current.variant_id === plan.variant_id),
          ),
          plan,
        ],
      }
    : workspace;

const optimisticPlan = (
  workspace: PlannerWorkspace,
  input: SaveDayRoutePlanInput,
): DayRoutePlan => {
  const existing = workspace.routePlans.find(
    (plan) => plan.day_id === input.dayId && plan.variant_id === input.variantId,
  );
  const now = new Date().toISOString();
  const planId = existing?.id ?? `optimistic-route-plan-${crypto.randomUUID()}`;
  const stops = input.itemIds.map((itemId, index) => ({
    created_at: now,
    id: `optimistic-route-stop-${crypto.randomUUID()}`,
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
      id: `optimistic-route-leg-${crypto.randomUUID()}`,
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
  };
};

export function useSaveDayRoutePlan(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDayRoutePlanInput) => requireData(await saveDayRoutePlan(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId));
      if (previous)
        client.setQueryData(
          plannerQueryKey(tripId),
          replacePlan(previous, optimisticPlan(previous, input)),
        );
      return { previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId), context?.previous),
    onSuccess: (plan) =>
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId), (current) =>
        replacePlan(current, plan),
      ),
    retry: false,
  });
}

export function useCalculateDayRoute(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CalculateDayRouteInput) =>
      requireData(await calculateDayRoute(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId));
      if (previous) {
        const plan = previous.routePlans.find(({ id }) => id === input.planId);
        if (plan)
          client.setQueryData(
            plannerQueryKey(tripId),
            replacePlan(previous, { ...plan, calculationState: "updating" }),
          );
      }
      return { previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId), context?.previous),
    onSuccess: (plan) =>
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId), (current) =>
        replacePlan(current, plan),
      ),
    retry: false,
  });
}

export function useClearDayRoutePlan(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClearDayRouteInput) => requireData(await clearDayRoutePlan(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId));
      if (previous)
        client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId), {
          ...previous,
          routePlans: previous.routePlans.filter(
            (plan) => !(plan.day_id === input.dayId && plan.variant_id === input.variantId),
          ),
        });
      return { previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId), context?.previous),
    retry: false,
  });
}

export { optimisticPlan, replacePlan };
