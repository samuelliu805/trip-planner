"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import {
  copyItineraryItems,
  insertTripDay,
  removeTripDay,
  reorderItineraryItems,
} from "@/features/itinerary/day-actions";
import {
  affectsDecisionSummary,
  plannerWorkspaceItems,
} from "@/features/itinerary/mutation-impact";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { removeItem, replaceItem, requireData } from "@/features/itinerary/query-cache";
import type {
  CopyItineraryItemsInput,
  InsertTripDayInput,
  RemoveTripDayInput,
  ReorderItineraryItemsInput,
} from "@/features/itinerary/schema";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";
import {
  invalidateVariantComparison,
  invalidateVariantDecisionSummary,
} from "@/features/variants/queries";

function invalidateDayStructure(client: QueryClient, tripId: string) {
  void invalidateVariantComparison(client, tripId);
  void invalidateVariantDecisionSummary(client, tripId);
}

export function useInsertTripDay(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: InsertTripDayInput) => requireData(await insertTripDay(input)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      invalidateDayStructure(client, tripId);
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
        optimistic.reduce((workspace, item) => replaceItem(workspace, item), current),
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
      if (context?.sources.some(({ type }) => type === "location"))
        void invalidateVariantComparison(client, tripId);
      if (context?.sources.some(({ type }) => affectsDecisionSummary(type)))
        void invalidateVariantDecisionSummary(client, tripId);
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
        reorderedCity: reorderedItems.some(({ type }) => type === "location"),
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
      if (context?.reorderedCity) void invalidateVariantComparison(client, tripId);
      if (context?.reorderedDecisionSummaryItem)
        void invalidateVariantDecisionSummary(client, tripId);
    },
  });
}
