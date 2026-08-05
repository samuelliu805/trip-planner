"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  clearItineraryItems,
  createItineraryItem,
  deleteItineraryItem,
  updateItineraryItem,
} from "@/features/itinerary/actions";
import { scheduleKind } from "@/features/itinerary/mutation-helpers";
import {
  affectsDecisionSummary,
  decisionSummaryItemChanged,
  plannerWorkspaceItems,
} from "@/features/itinerary/mutation-impact";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import {
  removeItem,
  removeItems,
  replaceItem,
  requireData,
} from "@/features/itinerary/query-cache";
import type {
  ClearItineraryItemsInput,
  CreateItineraryItemInput,
  DeleteItineraryItemInput,
  UpdateItineraryItemInput,
} from "@/features/itinerary/schema";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";
import {
  invalidateVariantComparison,
  invalidateVariantDecisionSummary,
} from "@/features/variants/queries";

export function useCreateItineraryItem(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateItineraryItemInput) =>
      requireData(await createItineraryItem(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const day = previous?.days.find(({ id }) => id === input.dayId);
      const optimistic: ItineraryItem = {
        booking_url: input.links?.[0]?.url ?? input.bookingUrl ?? null,
        created_at: new Date().toISOString(),
        day_id: input.dayId,
        details: input.details ?? {},
        end_time: input.endTime || null,
        id: `optimistic-${crypto.randomUUID()}`,
        links: (input.links ?? []).map((link, sort_order) => ({
          ...link,
          id: `optimistic-link-${crypto.randomUUID()}`,
          item_id: "",
          sort_order,
        })),
        notes: input.notes || null,
        place_id: input.placeId ?? null,
        place: input.placeSnapshot
          ? { ...input.placeSnapshot, id: `optimistic-place-${crypto.randomUUID()}` }
          : null,
        sort_order: Math.max(-1, ...(day?.items.map(({ sort_order }) => sort_order) ?? [])) + 1,
        schedule_kind: scheduleKind(input.startTime, input.endTime),
        schedule_text: null,
        start_time: input.startTime || null,
        title: input.title.trim(),
        trip_id: input.tripId,
        type: input.type,
        updated_at: new Date().toISOString(),
        variant_id: input.variantId,
      };
      client.setQueryData(plannerQueryKey(tripId, variantId), replaceItem(previous, optimistic));
      return { optimisticId: optimistic.id, previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (item, _input, context) => {
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        replaceItem(removeItem(current, context?.optimisticId ?? ""), item),
      );
      if (item.type === "location") void invalidateVariantComparison(client, tripId);
      if (affectsDecisionSummary(item.type)) void invalidateVariantDecisionSummary(client, tripId);
    },
  });
}

export function useUpdateItineraryItem(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateItineraryItemInput) =>
      requireData(await updateItineraryItem(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const existing = plannerWorkspaceItems(previous).find(({ id }) => id === input.id);
      if (existing)
        client.setQueryData(
          plannerQueryKey(tripId, variantId),
          replaceItem(previous, {
            ...existing,
            ...(input.links !== undefined && {
              booking_url: input.links[0]?.url ?? null,
              links: input.links.map((link, sort_order) => ({
                ...link,
                id: `optimistic-link-${crypto.randomUUID()}`,
                item_id: input.id,
                sort_order,
              })),
            }),
            ...(input.links === undefined &&
              input.bookingUrl !== undefined && { booking_url: input.bookingUrl || null }),
            ...(input.dayId !== undefined && { day_id: input.dayId }),
            ...(input.details !== undefined && { details: input.details }),
            ...(input.endTime !== undefined && { end_time: input.endTime || null }),
            ...(input.notes !== undefined && { notes: input.notes || null }),
            ...(input.placeId !== undefined && { place_id: input.placeId }),
            ...(input.placeSnapshot !== undefined && {
              place: input.placeSnapshot
                ? {
                    ...input.placeSnapshot,
                    id: existing.place_id ?? `optimistic-place-${crypto.randomUUID()}`,
                  }
                : null,
            }),
            ...(input.placeSnapshot === undefined && input.placeId === null && { place: null }),
            ...(input.startTime !== undefined && { start_time: input.startTime || null }),
            ...((input.startTime !== undefined || input.endTime !== undefined) && {
              schedule_kind: scheduleKind(
                input.startTime === undefined ? existing.start_time : input.startTime,
                input.endTime === undefined ? existing.end_time : input.endTime,
              ),
            }),
            ...(input.title !== undefined && { title: input.title.trim() }),
            ...(input.type !== undefined && { type: input.type }),
          }),
        );
      return { existing, existingWasCity: existing?.type === "location", previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (item, _input, context) => {
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        replaceItem(current, item),
      );
      if (item.type === "location" || context?.existingWasCity)
        void invalidateVariantComparison(client, tripId);
      if (decisionSummaryItemChanged(context?.existing, item))
        void invalidateVariantDecisionSummary(client, tripId);
    },
  });
}

export function useDeleteItineraryItem(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: DeleteItineraryItemInput) =>
      requireData(await deleteItineraryItem(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const deleted = plannerWorkspaceItems(previous).find((item) => item.id === input.id);
      client.setQueryData(plannerQueryKey(tripId, variantId), removeItem(previous, input.id));
      return {
        deletedCity: deleted?.type === "location",
        deletedDecisionSummaryItem: affectsDecisionSummary(deleted?.type),
        previous,
      };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (_data, _input, context) => {
      if (context?.deletedCity) void invalidateVariantComparison(client, tripId);
      if (context?.deletedDecisionSummaryItem)
        void invalidateVariantDecisionSummary(client, tripId);
    },
  });
}

export function useClearItineraryItems(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: ClearItineraryItemsInput) =>
      requireData(await clearItineraryItems(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const clearedItems = plannerWorkspaceItems(previous).filter((item) =>
        input.itemIds.includes(item.id),
      );
      client.setQueryData(plannerQueryKey(tripId, variantId), removeItems(previous, input.itemIds));
      return {
        clearedCity: clearedItems.some(({ type }) => type === "location"),
        clearedDecisionSummaryItem: clearedItems.some(({ type }) => affectsDecisionSummary(type)),
        previous,
      };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (_data, _input, context) => {
      void client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      if (context?.clearedCity) void invalidateVariantComparison(client, tripId);
      if (context?.clearedDecisionSummaryItem)
        void invalidateVariantDecisionSummary(client, tripId);
    },
  });
}
