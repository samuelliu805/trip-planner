"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createItineraryItem,
  clearItineraryItems,
  deleteItineraryItem,
  loadPlannerWorkspace,
  updateItineraryItem,
} from "@/features/itinerary/actions";
import {
  copyItineraryItems,
  insertTripDay,
  reorderItineraryItems,
  removeTripDay,
} from "@/features/itinerary/day-actions";
import { scheduleKind } from "@/features/itinerary/mutation-helpers";
import {
  removeItem,
  removeItems,
  replaceItem,
  requireData,
} from "@/features/itinerary/query-cache";
import type {
  CopyItineraryItemsInput,
  ClearItineraryItemsInput,
  CreateItineraryItemInput,
  DeleteItineraryItemInput,
  InsertTripDayInput,
  ReorderItineraryItemsInput,
  RemoveTripDayInput,
  UpdateItineraryItemInput,
} from "@/features/itinerary/schema";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";
import { invalidateVariantComparison } from "@/features/variants/queries";

export const plannerQueryKey = (tripId: string, variantId: string) =>
  ["planner", tripId, variantId] as const;

export function usePlannerWorkspace(
  tripId: string,
  variantId: string,
  initialData?: PlannerWorkspace,
) {
  return useQuery({
    initialData,
    queryFn: async () => requireData(await loadPlannerWorkspace(tripId, variantId)),
    queryKey: plannerQueryKey(tripId, variantId),
  });
}

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
      const existing = previous?.days
        .flatMap(({ items }) => items)
        .find(({ id }) => id === input.id);
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
      return { existingWasCity: existing?.type === "location", previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (item, _input, context) => {
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        replaceItem(current, item),
      );
      if (item.type === "location" || context?.existingWasCity)
        void invalidateVariantComparison(client, tripId);
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
      const deletedCity = previous?.days
        .flatMap(({ items }) => items)
        .some((item) => item.id === input.id && item.type === "location");
      client.setQueryData(plannerQueryKey(tripId, variantId), removeItem(previous, input.id));
      return { deletedCity, previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (_data, _input, context) => {
      if (context?.deletedCity) void invalidateVariantComparison(client, tripId);
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
      const clearedCity = previous?.days
        .flatMap(({ items }) => items)
        .some((item) => input.itemIds.includes(item.id) && item.type === "location");
      client.setQueryData(plannerQueryKey(tripId, variantId), removeItems(previous, input.itemIds));
      return { clearedCity, previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(plannerQueryKey(tripId, variantId), context?.previous),
    onSuccess: (_data, _input, context) => {
      void client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      if (context?.clearedCity) void invalidateVariantComparison(client, tripId);
    },
  });
}

export function useInsertTripDay(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: InsertTripDayInput) => requireData(await insertTripDay(input)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      void invalidateVariantComparison(client, tripId);
    },
  });
}

export function useRemoveTripDay(tripId: string, variantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: RemoveTripDayInput) => requireData(await removeTripDay(input)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      void invalidateVariantComparison(client, tripId);
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
      const sources = input.sourceItemIds
        .map((id) => previous?.days.flatMap(({ items }) => items).find((item) => item.id === id))
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
      const reorderedCity = previous?.days
        .find(({ id }) => id === input.dayId)
        ?.items.some(
          (item) => input.items.some(({ id }) => id === item.id) && item.type === "location",
        );
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
      return { previous, reorderedCity };
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
    },
  });
}
