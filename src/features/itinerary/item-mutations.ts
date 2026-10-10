"use client";

import { usePlannerOutbox } from "./planner-outbox-provider";
import { rollbackWorkspaceChange } from "@/features/itinerary/workspace-rollback";
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
  affectsLocalityProjection,
  decisionSummaryItemChanged,
  localityProjectionItemChanged,
  plannerWorkspaceItems,
} from "@/features/itinerary/mutation-impact";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import {
  rebaseAdditiveItemCreate,
  rebaseUnchangedCellClear,
  rebaseUnchangedItemDelete,
  rebaseUnchangedItemEdit,
} from "@/features/itinerary/mutation-rebase";
import { retryPlannerMutation } from "@/features/itinerary/mutation-retry";
import {
  removeItem,
  removeItems,
  replaceItem,
  requireData,
} from "@/features/itinerary/query-cache";
import type { ClearItineraryItemsInput } from "@/features/itinerary/day-schema";
import type {
  CreateItineraryItemInput,
  DeleteItineraryItemInput,
  UpdateItineraryItemInput,
} from "@/features/itinerary/item-schema";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";
import {
  invalidateVariantComparison,
  invalidateVariantDecisionSummary,
} from "@/features/variants/queries";
import { insertActivityAtPlacement } from "@/features/itinerary/activity-order";
import { refreshResearchWorkspace } from "@/features/research/research-query";
import {
  itemKindForTelemetry,
  itemKindsForTelemetry,
  newTelemetryOperationId,
} from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { placeSnapshotFromJson } from "@/lib/providers/places/types";
import { usePlannerPersistence } from "@/features/itinerary/planner-persistence";

export function useCreateItineraryItem(tripId: string, variantId: string) {
  const client = useQueryClient();
  const persistence = usePlannerPersistence();
  const outbox = usePlannerOutbox();
  return useMutation({
    networkMode: "always",
    mutationFn: async (input: CreateItineraryItemInput) =>
      outbox
        ? outbox
            .accept({ kind: "create", input })
            .days.flatMap(({ items }) => items)
            .find(({ id }) => id === input.operationId)!
        : persistence
          ? persistence.createItem(input)
          : retryPlannerMutation(
              input,
              async (value) => requireData(await createItineraryItem(value)),
              rebaseAdditiveItemCreate,
              tripId,
              variantId,
            ),
    onMutate: async (input) => {
      if (outbox) return undefined;
      input.operationId ??= newTelemetryOperationId();
      input.surface ??= "planner";
      const itemKind = itemKindForTelemetry(input.type);
      if (itemKind) {
        captureBrowserProductEvent(
          "item_create_started",
          {
            item_kind: itemKind,
            operation_id: input.operationId,
            surface: input.surface,
          },
          { actorType: persistence?.actorType ?? "authenticated" },
        );
      }
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const day = previous?.days.find(({ id }) => id === input.dayId);
      const optimisticPlace = placeSnapshotFromJson(input.placeSnapshot);
      const optimistic: ItineraryItem = {
        booking_url: input.links?.[0]?.url ?? input.bookingUrl ?? null,
        attachments: [],
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
        place: optimisticPlace
          ? { ...optimisticPlace, id: `optimistic-place-${crypto.randomUUID()}` }
          : null,
        price_amount: input.priceAmount ?? null,
        price_currency:
          input.priceAmount === null || input.priceAmount === undefined
            ? null
            : (input.priceCurrency ?? null),
        sort_order: Math.max(-1, ...(day?.items.map(({ sort_order }) => sort_order) ?? [])) + 1,
        schedule_kind: scheduleKind(input.startTime, input.endTime),
        schedule_text: null,
        start_time: input.startTime || null,
        title: input.title.trim(),
        trip_id: input.tripId,
        type: input.type,
        updated_at: new Date().toISOString(),
        variant_id: input.variantId,
        version: 1,
      };
      const orderedItems = insertActivityAtPlacement(
        day?.items ?? [],
        optimistic,
        input.insertAfterItemId,
      );
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        current
          ? {
              ...current,
              days: current.days.map((entry) =>
                entry.id === input.dayId ? { ...entry, items: orderedItems } : entry,
              ),
            }
          : current,
      );
      return {
        optimisticId: optimistic.id,
        previous,
        applied: client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)),
      };
    },
    onError: (_error, _input, context) =>
      context?.previous &&
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        rollbackWorkspaceChange(current, context.previous, context.applied),
      ),
    onSuccess: async (item, _input, context) => {
      if (outbox) return;
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        replaceItem(removeItem(current, context?.optimisticId ?? ""), item),
      );
      if (!persistence) {
        // A create advances the day's aggregate items version. Await the refresh so
        // Save & create another cannot submit the stale collection version.
        await client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        if (affectsLocalityProjection(item.type)) void invalidateVariantComparison(client, tripId);
        if (affectsDecisionSummary(item.type))
          void invalidateVariantDecisionSummary(client, tripId);
        void refreshResearchWorkspace(client, tripId, variantId);
      }
    },
  });
}

export function useUpdateItineraryItem(tripId: string, variantId: string) {
  const client = useQueryClient();
  const persistence = usePlannerPersistence();
  const outbox = usePlannerOutbox();
  return useMutation({
    networkMode: "always",
    mutationFn: async (input: UpdateItineraryItemInput) => {
      if (outbox)
        return outbox
          .accept({ kind: "update", input })
          .days.flatMap(({ items }) => items)
          .find(({ id }) => id === input.id)!;
      if (persistence) return persistence.updateItem(input);
      return retryPlannerMutation(
        input,
        async (value) => requireData(await updateItineraryItem(value)),
        rebaseUnchangedItemEdit,
        tripId,
        variantId,
      );
    },
    onMutate: async (input) => {
      if (outbox) return undefined;
      input.operationId ??= newTelemetryOperationId();
      input.surface ??= "planner";
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const existing = plannerWorkspaceItems(previous).find(({ id }) => id === input.id);
      const optimisticPlace = placeSnapshotFromJson(input.placeSnapshot);
      if (existing) {
        const optimistic = {
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
            place: optimisticPlace
              ? {
                  ...optimisticPlace,
                  id: existing.place_id ?? `optimistic-place-${crypto.randomUUID()}`,
                }
              : null,
          }),
          ...(input.placeSnapshot === undefined && input.placeId === null && { place: null }),
          ...(input.priceAmount !== undefined && { price_amount: input.priceAmount }),
          ...((input.priceAmount !== undefined || input.priceCurrency !== undefined) && {
            price_currency:
              input.priceAmount === null ? null : (input.priceCurrency ?? existing.price_currency),
          }),
          ...(input.startTime !== undefined && { start_time: input.startTime || null }),
          ...((input.startTime !== undefined || input.endTime !== undefined) && {
            schedule_kind: scheduleKind(
              input.startTime === undefined ? existing.start_time : input.startTime,
              input.endTime === undefined ? existing.end_time : input.endTime,
            ),
          }),
          ...(input.title !== undefined && { title: input.title.trim() }),
          ...(input.type !== undefined && { type: input.type }),
        };
        let optimisticWorkspace = replaceItem(previous, optimistic);
        if (input.insertAfterItemId !== undefined && optimisticWorkspace)
          optimisticWorkspace = {
            ...optimisticWorkspace,
            days: optimisticWorkspace.days.map((day) =>
              day.id === optimistic.day_id
                ? {
                    ...day,
                    items: insertActivityAtPlacement(
                      day.items,
                      optimistic,
                      input.insertAfterItemId,
                    ),
                  }
                : day,
            ),
          };
        client.setQueryData(plannerQueryKey(tripId, variantId), optimisticWorkspace);
      }
      return {
        existing,
        previous,
        applied: client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)),
      };
    },
    onError: (_error, _input, context) =>
      context?.previous &&
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        rollbackWorkspaceChange(current, context.previous, context.applied),
      ),
    onSuccess: async (item, _input, context) => {
      if (outbox) return;
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        replaceItem(current, item),
      );
      if (!persistence) {
        // Item saves advance the aggregate day version even if the item itself is unchanged.
        await client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        if (localityProjectionItemChanged(context?.existing, item))
          void invalidateVariantComparison(client, tripId);
        if (decisionSummaryItemChanged(context?.existing, item))
          void invalidateVariantDecisionSummary(client, tripId);
        void refreshResearchWorkspace(client, tripId, variantId);
      }
    },
  });
}

export function useDeleteItineraryItem(tripId: string, variantId: string) {
  const client = useQueryClient();
  const persistence = usePlannerPersistence();
  const outbox = usePlannerOutbox();
  return useMutation({
    networkMode: "always",
    mutationFn: async (input: DeleteItineraryItemInput) =>
      outbox
        ? (outbox.accept({ kind: "delete", input }), { id: input.id })
        : persistence
          ? persistence.deleteItem(input)
          : retryPlannerMutation(
              input,
              async (value) => requireData(await deleteItineraryItem(value)),
              rebaseUnchangedItemDelete,
              tripId,
              variantId,
            ),
    onMutate: async (input) => {
      if (outbox) return undefined;
      input.operationId ??= newTelemetryOperationId();
      input.surface ??= "planner";
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const deleted = plannerWorkspaceItems(previous).find((item) => item.id === input.id);
      input.itemKind ??= deleted?.type;
      client.setQueryData(plannerQueryKey(tripId, variantId), removeItem(previous, input.id));
      return {
        deletedLocalitySource: affectsLocalityProjection(deleted?.type),
        deletedDecisionSummaryItem: affectsDecisionSummary(deleted?.type),
        previous,
        applied: client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)),
      };
    },
    onError: (_error, _input, context) =>
      context?.previous &&
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        rollbackWorkspaceChange(current, context.previous, context.applied),
      ),
    onSuccess: async (_data, _input, context) => {
      if (outbox) return;
      if (!persistence) {
        await client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        if (context?.deletedLocalitySource) void invalidateVariantComparison(client, tripId);
        if (context?.deletedDecisionSummaryItem)
          void invalidateVariantDecisionSummary(client, tripId);
        void refreshResearchWorkspace(client, tripId, variantId);
      }
    },
  });
}

export function useClearItineraryItems(tripId: string, variantId: string) {
  const client = useQueryClient();
  const persistence = usePlannerPersistence();
  const outbox = usePlannerOutbox();
  return useMutation({
    networkMode: "always",
    mutationFn: async (input: ClearItineraryItemsInput) =>
      outbox
        ? (outbox.accept({ kind: "clear", input }), { ids: input.itemIds })
        : persistence
          ? persistence.clearItems(input)
          : retryPlannerMutation(
              input,
              async (value) => requireData(await clearItineraryItems(value)),
              rebaseUnchangedCellClear,
              tripId,
              variantId,
            ),
    onMutate: async (input) => {
      if (outbox) return undefined;
      await client.cancelQueries({ queryKey: plannerQueryKey(tripId, variantId) });
      const previous = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const clearedItems = plannerWorkspaceItems(previous).filter((item) =>
        input.itemIds.includes(item.id),
      );
      input.itemKinds ??= itemKindsForTelemetry(clearedItems.map(({ type }) => type));
      input.operationId ??= newTelemetryOperationId();
      input.surface ??= "planner";
      client.setQueryData(plannerQueryKey(tripId, variantId), removeItems(previous, input.itemIds));
      return {
        clearedLocalitySource: clearedItems.some(({ type }) => affectsLocalityProjection(type)),
        clearedDecisionSummaryItem: clearedItems.some(({ type }) => affectsDecisionSummary(type)),
        previous,
        applied: client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId)),
      };
    },
    onError: (_error, _input, context) =>
      context?.previous &&
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        rollbackWorkspaceChange(current, context.previous, context.applied),
      ),
    onSuccess: async (_data, _input, context) => {
      if (outbox) return;
      if (!persistence) {
        await client.invalidateQueries({ queryKey: plannerQueryKey(tripId, variantId) });
        if (context?.clearedLocalitySource) void invalidateVariantComparison(client, tripId);
        if (context?.clearedDecisionSummaryItem)
          void invalidateVariantDecisionSummary(client, tripId);
        void refreshResearchWorkspace(client, tripId, variantId);
      }
    },
  });
}
