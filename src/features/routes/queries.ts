"use client";

import { optimisticPlan, replacePlan } from "./route-cache";
import { rollbackWorkspaceChange } from "@/features/itinerary/workspace-rollback";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { requireData } from "@/features/itinerary/query-cache";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import { invalidateVariantDecisionSummary } from "@/features/variants/queries";

import {
  calculateDayRoute,
  calculateOverviewRoute,
  clearDayRoutePlan,
  saveDayRoutePlan,
} from "./actions";
import type {
  CalculateDayRouteInput,
  CalculateOverviewRouteInput,
  ClearDayRouteInput,
  DayRoutePlan,
  SaveDayRoutePlanInput,
} from "./types";

export function useCalculateOverviewRoute() {
  return useMutation({
    mutationFn: async (input: CalculateOverviewRouteInput) =>
      requireData(await calculateOverviewRoute(input)),
    retry: false,
  });
}

export function useSaveDayRoutePlan(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDayRoutePlanInput) => requireData(await saveDayRoutePlan(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      if (previous)
        client.setQueryData(
          plannerQueryKey(tripId, variantId),
          replacePlan(previous, optimisticPlan(previous, input)),
        );
      return {
        previous,
        applied: client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)),
      };
    },
    onError: (_error, _input, context) =>
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        rollbackWorkspaceChange(current, context?.previous, context?.applied),
      ),
    onSuccess: (plan) => {
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        replacePlan(current, plan),
      );
      void invalidateVariantDecisionSummary(client, tripId);
    },
    retry: false,
  });
}

export function useCalculateDayRoute(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CalculateDayRouteInput) =>
      requireData(await calculateDayRoute(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      if (previous) {
        const plan = previous.routePlans.find(({ id }) => id === input.planId);
        if (plan)
          client.setQueryData(
            plannerQueryKey(tripId, variantId),
            replacePlan(previous, { ...plan, calculationState: "updating" }),
          );
      }
      return {
        previous,
        applied: client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)),
      };
    },
    onError: (_error, _input, context) =>
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        rollbackWorkspaceChange(current, context?.previous, context?.applied),
      ),
    onSuccess: (plan) => {
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        replacePlan(current, plan),
      );
      void invalidateVariantDecisionSummary(client, tripId);
    },
    retry: false,
  });
}

export function useClearDayRoutePlan(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClearDayRouteInput) => requireData(await clearDayRoutePlan(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      if (previous)
        client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), {
          ...previous,
          routePlans: previous.routePlans.filter(
            (plan) => !(plan.day_id === input.dayId && plan.variant_id === input.variantId),
          ),
        });
      return {
        previous,
        applied: client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)),
      };
    },
    onError: (_error, _input, context) =>
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        rollbackWorkspaceChange(current, context?.previous, context?.applied),
      ),
    onSuccess: () => void invalidateVariantDecisionSummary(client, tripId),
    retry: false,
  });
}

export { optimisticPlan, replacePlan } from "./route-cache";
