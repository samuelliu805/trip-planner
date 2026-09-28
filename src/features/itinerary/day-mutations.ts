"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  insertTripDay,
  removeTripDay,
  reorderItineraryItems,
  reorderVariantDays,
} from "@/features/itinerary/day-actions";
import {
  affectsDecisionSummary,
  affectsLocalityProjection,
} from "@/features/itinerary/mutation-impact";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import {
  rebaseDayInsert,
  rebaseUnchangedDayDelete,
  rebaseUnchangedItemOrder,
} from "@/features/itinerary/mutation-rebase";
import { retryPlannerMutation } from "@/features/itinerary/mutation-retry";
import { replaceItem, requireData } from "@/features/itinerary/query-cache";
import { reorderWorkspaceDays } from "@/features/itinerary/day-order";
import type {
  InsertTripDayInput,
  RemoveTripDayInput,
  ReorderItineraryItemsInput,
  ReorderVariantDaysInput,
} from "@/features/itinerary/day-schema";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import {
  invalidateVariantComparison,
  invalidateVariantDecisionSummary,
} from "@/features/variants/queries";
import { refreshResearchWorkspace } from "@/features/research/research-query";
import { itemKindsForTelemetry, newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { usePlannerPersistence } from "@/features/itinerary/planner-persistence";

function invalidateDayStructure(client: QueryClient, tripId: string) {
  void invalidateVariantComparison(client, tripId);
  void invalidateVariantDecisionSummary(client, tripId);
}

function refreshResearch(client: QueryClient, tripId: string, variantId: string) {
  void refreshResearchWorkspace(client, tripId, variantId);
}

export function useInsertTripDay(tripId: string, variantId: string) {
  const client = useQueryClient();
  const persistence = usePlannerPersistence();
  return useMutation({
    mutationFn: async (input: InsertTripDayInput) => {
      if (persistence) return persistence.insertDay(input);
      const original = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      return retryPlannerMutation(
        input,
        async (value) => requireData(await insertTripDay(value)),
        (value, latest) => rebaseDayInsert(value, original, latest),
        tripId,
        variantId,
      );
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      if (!persistence) {
        invalidateDayStructure(client, tripId);
        refreshResearch(client, tripId, variantId);
      }
    },
  });
}

export function useRemoveTripDay(tripId: string, variantId: string) {
  const client = useQueryClient();
  const persistence = usePlannerPersistence();
  return useMutation({
    mutationFn: async (input: RemoveTripDayInput) =>
      persistence
        ? persistence.removeDay(input)
        : retryPlannerMutation(
            input,
            async (value) => requireData(await removeTripDay(value)),
            rebaseUnchangedDayDelete,
            tripId,
            variantId,
          ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      if (!persistence) {
        invalidateDayStructure(client, tripId);
        refreshResearch(client, tripId, variantId);
      }
    },
  });
}

export function useReorderVariantDays(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReorderVariantDaysInput) =>
      requireData(await reorderVariantDays(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      client.setQueryData(
        plannerQueryKey(tripId, variantId),
        reorderWorkspaceDays(previous, input.orderedDayIds),
      );
      return { previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (workspace) => {
      client.setQueryData(plannerQueryKey(tripId, variantId), workspace);
      invalidateDayStructure(client, tripId);
      refreshResearch(client, tripId, variantId);
    },
  });
}

export function useReorderItineraryItems(tripId: string, variantId: string) {
  const client = useQueryClient();
  const persistence = usePlannerPersistence();
  return useMutation({
    mutationFn: async (input: ReorderItineraryItemsInput) => {
      if (persistence) return persistence.reorderItems(input);
      const original = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      return retryPlannerMutation(
        input,
        async (value) => requireData(await reorderItineraryItems(value)),
        (value, latest) => rebaseUnchangedItemOrder(value, original, latest),
        tripId,
        variantId,
      );
    },
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const reorderedItems =
        previous?.days
          .find(({ id }) => id === input.dayId)
          ?.items.filter((item) => input.items.some(({ id }) => id === item.id)) ?? [];
      input.itemKinds ??= itemKindsForTelemetry(reorderedItems.map(({ type }) => type));
      input.operationId ??= newTelemetryOperationId();
      input.surface ??= "planner";
      const orders = new Map(input.items.map(({ id, sortOrder }) => [id, sortOrder]));
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        current
          ? {
              ...current,
              days: current.days.map((day) =>
                day.id === input.dayId
                  ? {
                      ...day,
                      items: day.items
                        .map((item) => ({
                          ...item,
                          sort_order: orders.get(item.id) ?? item.sort_order,
                        }))
                        .sort((a, b) => a.sort_order - b.sort_order),
                    }
                  : day,
              ),
            }
          : current,
      );
      return {
        previous,
        reorderedLocalitySource: reorderedItems.some(({ type }) => affectsLocalityProjection(type)),
        reorderedDecisionSummaryItem: reorderedItems.some(({ type }) =>
          affectsDecisionSummary(type),
        ),
      };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: async (items, _input, context) => {
      items.forEach((item) =>
        client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
          replaceItem(current, item),
        ),
      );
      if (!persistence) {
        await client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        if (context?.reorderedLocalitySource) void invalidateVariantComparison(client, tripId);
        if (context?.reorderedDecisionSummaryItem)
          void invalidateVariantDecisionSummary(client, tripId);
        refreshResearch(client, tripId, variantId);
      }
    },
  });
}

export { useCopyItineraryItems } from "./copy-mutations";
