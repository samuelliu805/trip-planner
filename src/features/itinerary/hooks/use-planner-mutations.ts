"use client";

import { useRouter } from "next/navigation";
import type { Dispatch, SetStateAction } from "react";

import {
  useDeleteItineraryItem,
  useInsertTripDay,
  useRemoveTripDay,
  useReorderItineraryItems,
} from "@/features/itinerary/queries";
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";

export function usePlannerMutations(
  tripId: string,
  setInteractionError: Dispatch<SetStateAction<string | undefined>>,
) {
  const router = useRouter();
  const deleteMutation = useDeleteItineraryItem(tripId);
  const insertDayMutation = useInsertTripDay(tripId);
  const removeDayMutation = useRemoveTripDay(tripId);
  const reorderMutation = useReorderItineraryItems(tripId);

  async function insertDay(beforeDayNumber: number) {
    try {
      await insertDayMutation.mutateAsync({ beforeDayNumber, tripId });
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
      await removeDayMutation.mutateAsync({ dayId, tripId });
      setInteractionError(undefined);
      router.refresh();
    } catch (error) {
      setInteractionError(error instanceof Error ? error.message : "The day could not be removed.");
    }
  }

  async function moveItem(
    day: PlannerDay,
    categoryItems: ItineraryItem[],
    itemIndex: number,
    direction: -1 | 1,
  ) {
    const targetIndex = itemIndex + direction;
    if (targetIndex < 0 || targetIndex >= categoryItems.length) return;
    const reorderedCategory = [...categoryItems];
    [reorderedCategory[itemIndex], reorderedCategory[targetIndex]] = [
      reorderedCategory[targetIndex],
      reorderedCategory[itemIndex],
    ];
    let categoryIndex = 0;
    const ordered = [...day.items]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((item) =>
        categoryItems.some(({ id }) => id === item.id) ? reorderedCategory[categoryIndex++] : item,
      );
    try {
      await reorderMutation.mutateAsync({
        dayId: day.id,
        items: ordered.map((item, sortOrder) => ({ id: item.id, sortOrder })),
        tripId,
      });
      setInteractionError(undefined);
    } catch {
      setInteractionError("The item order could not be saved. The previous order was restored.");
    }
  }

  async function deleteItem(item: ItineraryItem) {
    try {
      await deleteMutation.mutateAsync({ id: item.id, tripId });
      setInteractionError(undefined);
    } catch {
      setInteractionError(`“${item.title}” could not be deleted. Please try again.`);
    }
  }

  return {
    dayMutationPending: insertDayMutation.isPending || removeDayMutation.isPending,
    deleteItem,
    insertDay,
    moveItem,
    removeDay,
  };
}
