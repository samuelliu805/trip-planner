"use client";

import { useRouter } from "next/navigation";
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
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";

export function usePlannerMutations(
  tripId: string,
  variantId: string,
  setInteractionError: Dispatch<SetStateAction<string | undefined>>,
) {
  const router = useRouter();
  const deleteMutation = useDeleteItineraryItem(tripId, variantId);
  const clearMutation = useClearItineraryItems(tripId, variantId);
  const insertDayMutation = useInsertTripDay(tripId, variantId);
  const removeDayMutation = useRemoveTripDay(tripId, variantId);
  const reorderMutation = useReorderItineraryItems(tripId, variantId);

  async function insertDay(beforeDayNumber: number) {
    try {
      await insertDayMutation.mutateAsync({ beforeDayNumber, tripId, variantId });
      setInteractionError(undefined);
      router.refresh();
    } catch (error) {
      setInteractionError(
        error instanceof Error ? error.message : "The day could not be inserted.",
      );
    }
  }

  async function removeDay(dayId: string) {
    try {
      await removeDayMutation.mutateAsync({ dayId, tripId, variantId });
      setInteractionError(undefined);
      router.refresh();
    } catch (error) {
      setInteractionError(error instanceof Error ? error.message : "The day could not be removed.");
    }
  }

  async function reorderItems(day: PlannerDay, orderedItemIds: string[]) {
    try {
      await reorderMutation.mutateAsync({
        dayId: day.id,
        items: orderedItemIds.map((id, sortOrder) => ({ id, sortOrder })),
        tripId,
        variantId,
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
      await deleteMutation.mutateAsync({
        id: item.id,
        itemKind: item.type,
        surface: "planner",
        tripId,
        variantId,
      });
      setInteractionError(undefined);
    } catch {
      setInteractionError(`“${item.title}” could not be deleted. Please try again.`);
    }
  }

  async function clearItems(items: ItineraryItem[]) {
    try {
      await clearMutation.mutateAsync({
        itemIds: items.map(({ id }) => id),
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
