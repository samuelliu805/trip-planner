"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  copyItineraryItems,
  insertTripDay,
  removeTripDay,
  reorderItineraryItems,
  reorderVariantDays,
} from "@/features/itinerary/day-actions";
import {
  affectsDecisionSummary,
  affectsLocalityProjection,
  plannerWorkspaceItems,
} from "@/features/itinerary/mutation-impact";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { removeItem, replaceItem, requireData } from "@/features/itinerary/query-cache";
import { reorderWorkspaceDays } from "@/features/itinerary/day-order";
import { insertActivityAtPlacement } from "@/features/itinerary/activity-order";
import type {
  CopyItineraryItemsInput,
  InsertTripDayInput,
  RemoveTripDayInput,
  ReorderItineraryItemsInput,
  ReorderVariantDaysInput,
} from "@/features/itinerary/day-schema";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";
import {
  invalidateVariantComparison,
  invalidateVariantDecisionSummary,
} from "@/features/variants/queries";
import { refreshResearchWorkspace } from "@/features/research/research-query";

function invalidateDayStructure(client: QueryClient, tripId: string) {
  void invalidateVariantComparison(client, tripId);
  void invalidateVariantDecisionSummary(client, tripId);
}

function refreshResearch(client: QueryClient, tripId: string, variantId: string) {
  void refreshResearchWorkspace(client, tripId, variantId);
}

export function useInsertTripDay(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: InsertTripDayInput) => requireData(await insertTripDay(input)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      invalidateDayStructure(client, tripId);
      refreshResearch(client, tripId, variantId);
    },
  });
}

export function useRemoveTripDay(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: RemoveTripDayInput) => requireData(await removeTripDay(input)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      invalidateDayStructure(client, tripId);
      refreshResearch(client, tripId, variantId);
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

export function useCopyItineraryItems(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CopyItineraryItemsInput) =>
      requireData(await copyItineraryItems(input)),
    onMutate: async (input) => {
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const workspaceItems = plannerWorkspaceItems(previous);
      const sources = input.sourceItemIds
        .map((id) => workspaceItems.find((item) => item.id === id))
        .filter((item): item is ItineraryItem => Boolean(item));
      const destination = previous?.days.find(({ id }) => id === input.targetDayId);
      const nextOrder =
        destination?.items.reduce((maximum, item) => Math.max(maximum, item.sort_order), -1) ?? -1;
      const optimistic = sources.map((source, index): ItineraryItem => ({
        ...source,
        created_at: new Date().toISOString(),
        day_id: input.targetDayId,
        id: `optimistic-${crypto.randomUUID()}`,
        place_id: input.preservePlace === false ? null : source.place_id,
        sort_order: nextOrder + index + 1,
        updated_at: new Date().toISOString(),
      }));
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        current
          ? {
              ...current,
              days: current.days.map((day) =>
                day.id === input.targetDayId
                  ? {
                      ...day,
                      items: optimistic.reduce(
                        (items, item) => insertActivityAtPlacement(items, item),
                        day.items,
                      ),
                    }
                  : day,
              ),
            }
          : current,
      );
      return { optimisticIds: optimistic.map(({ id }) => id), previous, sources };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (items, input, context) => {
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        items.reduce(
          (workspace, item) => {
            const source = context?.sources.find(
              ({ place_id }) => Boolean(place_id) && place_id === item.place_id,
            );
            return replaceItem(workspace, {
              ...item,
              place: input.preservePlace === false ? null : (source?.place ?? null),
            });
          },
          context?.optimisticIds.reduce((workspace, id) => removeItem(workspace, id), current),
        ),
      );
      if (context?.sources.some(({ type }) => affectsLocalityProjection(type)))
        void invalidateVariantComparison(client, tripId);
      if (context?.sources.some(({ type }) => affectsDecisionSummary(type)))
        void invalidateVariantDecisionSummary(client, tripId);
      refreshResearch(client, tripId, variantId);
    },
  });
}

export function useReorderItineraryItems(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ReorderItineraryItemsInput) =>
      requireData(await reorderItineraryItems(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const reorderedItems =
        previous?.days
          .find(({ id }) => id === input.dayId)
          ?.items.filter((item) => input.items.some(({ id }) => id === item.id)) ?? [];
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
    onSuccess: (items, _input, context) => {
      items.forEach((item) =>
        client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
          replaceItem(current, item),
        ),
      );
      if (context?.reorderedLocalitySource) void invalidateVariantComparison(client, tripId);
      if (context?.reorderedDecisionSummaryItem)
        void invalidateVariantDecisionSummary(client, tripId);
      refreshResearch(client, tripId, variantId);
    },
  });
}
