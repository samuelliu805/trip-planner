"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { plannerQueryKey } from "@/features/itinerary/planner-query";
import type { ItineraryItem, PlannerWorkspace } from "@/features/itinerary/types";

export type PlannerItemReloadResult = {
  item?: ItineraryItem;
  items: ItineraryItem[];
};

export function usePlannerItemConflictReload({
  dayId,
  item,
  tripId,
  variantId,
}: {
  dayId: string;
  item?: ItineraryItem;
  tripId: string;
  variantId: string;
}) {
  const client = useQueryClient();
  const [currentItem, setCurrentItem] = useState(item);
  const [currentDayItems, setCurrentDayItems] = useState<ItineraryItem[]>();
  const [reloadError, setReloadError] = useState<string>();
  const [revision, setRevision] = useState(0);

  async function reloadLatest(): Promise<PlannerItemReloadResult | undefined> {
    setReloadError(undefined);
    try {
      const queryKey = plannerQueryKey(tripId, variantId);
      await client.refetchQueries({ queryKey, type: "active" }, { throwOnError: true });
      const workspace = client.getQueryData<PlannerWorkspace>(queryKey);
      const latestDay = currentItem
        ? workspace?.days.find((day) => day.items.some(({ id }) => id === currentItem.id))
        : workspace?.days.find(({ id }) => id === dayId);
      if (!latestDay) throw new Error("The latest day could not be loaded.");

      const latestItem = currentItem
        ? latestDay.items.find(({ id }) => id === currentItem.id)
        : undefined;
      if (currentItem && !latestItem) throw new Error("The latest item could not be loaded.");

      setCurrentDayItems(latestDay.items);
      if (latestItem) {
        setCurrentItem(latestItem);
        setRevision((value) => value + 1);
      }
      return { item: latestItem, items: latestDay.items };
    } catch (error) {
      setReloadError(
        error instanceof Error ? error.message : "The latest day could not be loaded.",
      );
      return undefined;
    }
  }

  return {
    currentDayItems,
    currentItem,
    reloadError,
    reloadLatest,
    revision,
  };
}
