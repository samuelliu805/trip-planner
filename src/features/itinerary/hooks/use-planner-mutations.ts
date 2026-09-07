"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";

import {
  useInsertTripDay,
  useRemoveTripDay,
  useReorderItineraryItems,
} from "@/features/itinerary/day-mutations";
import {
  useClearItineraryItems,
  useDeleteItineraryItem,
} from "@/features/itinerary/item-mutations";
import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "@/features/itinerary/types";
import { usePlannerPersistence } from "@/features/itinerary/planner-persistence";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { plannerQueryKey } from "@/features/itinerary/planner-query";

export function usePlannerMutations(
  tripId: string,
  variantId: string,
  setInteractionError: Dispatch<SetStateAction<string | undefined>>,
) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const persistence = usePlannerPersistence();
  const deleteMutation = useDeleteItineraryItem(tripId, variantId);
  const clearMutation = useClearItineraryItems(tripId, variantId);
  const insertDayMutation = useInsertTripDay(tripId, variantId);
  const removeDayMutation = useRemoveTripDay(tripId, variantId);
  const reorderMutation = useReorderItineraryItems(tripId, variantId);

  async function insertDay(beforeDayNumber: number) {
    try {
      const workspace = queryClient.getQueryData<PlannerWorkspace>(
        plannerQueryKey(tripId, variantId),
      );
      if (!workspace?.variant.days_version)
        throw new Error("Reload this plan before adding a day.");
      await insertDayMutation.mutateAsync({
        beforeDayNumber,
        expectedDaysVersion: workspace.variant.days_version,
        operationId: newTelemetryOperationId(),
        tripId,
        variantId,
      });
      setInteractionError(undefined);
      if (!persistence) router.refresh();
    } catch (error) {
      setInteractionError(
        error instanceof Error ? error.message : "The day could not be inserted.",
      );
    }
  }

  async function removeDay(dayId: string) {
    try {
      const workspace = queryClient.getQueryData<PlannerWorkspace>(
        plannerQueryKey(tripId, variantId),
      );
      const day = workspace?.days.find(({ id }) => id === dayId);
      if (!workspace?.variant.days_version || !day)
        throw new Error("Reload this plan before removing the day.");
      await removeDayMutation.mutateAsync({
        dayId,
        expectedDaysVersion: workspace.variant.days_version,
        expectedVersion: day.version,
        operationId: newTelemetryOperationId(),
        tripId,
        variantId,
      });
      setInteractionError(undefined);
      if (!persistence) router.refresh();
    } catch (error) {
      setInteractionError(error instanceof Error ? error.message : "The day could not be removed.");
    }
  }

  async function reorderItems(day: PlannerDay, orderedItemIds: string[]) {
    try {
      await reorderMutation.mutateAsync({
        dayId: day.id,
        expectedItemsVersion: day.items_version,
        items: orderedItemIds.map((id, sortOrder) => ({ id, sortOrder })),
        tripId,
        variantId,
        operationId: newTelemetryOperationId(),
      });
      setInteractionError(undefined);
      return true;
    } catch {
      setInteractionError("The item order could not be saved. The previous order was restored.");
      return false;
    }
  }

  async function deleteItem(item: ItineraryItem) {
    try {
      const workspace = queryClient.getQueryData<PlannerWorkspace>(
        plannerQueryKey(tripId, variantId),
      );
      const dayVersion = workspace?.days.find(({ id }) => id === item.day_id)?.items_version;
      if (!dayVersion) throw new Error("Reload this day before deleting the item.");
      await deleteMutation.mutateAsync({
        expectedItemsVersion: dayVersion,
        expectedVersion: item.version,
        id: item.id,
        itemKind: item.type,
        surface: "planner",
        tripId,
        variantId,
        operationId: newTelemetryOperationId(),
      });
      setInteractionError(undefined);
    } catch {
      setInteractionError(`“${item.title}” could not be deleted. Please try again.`);
    }
  }

  async function clearItems(items: ItineraryItem[]) {
    try {
      const workspace = queryClient.getQueryData<PlannerWorkspace>(
        plannerQueryKey(tripId, variantId),
      );
      const itemsVersion = workspace?.variant.items_version;
      if (!itemsVersion) throw new Error("Reload this plan before clearing items.");
      await clearMutation.mutateAsync({
        expectedItemsVersion: itemsVersion,
        itemIds: items.map(({ id }) => id),
        operationId: newTelemetryOperationId(),
        tripId,
        variantId,
      });
      setInteractionError(undefined);
      return true;
    } catch (error) {
      setInteractionError(
        error instanceof Error ? error.message : "The selected cells could not be cleared.",
      );
      return false;
    }
  }

  return {
    dayMutationPending: insertDayMutation.isPending || removeDayMutation.isPending,
    clearItems,
    clearPending: clearMutation.isPending,
    deleteItem,
    insertDay,
    itemOrderPending: reorderMutation.isPending,
    reorderItems,
    removeDay,
  };
}
