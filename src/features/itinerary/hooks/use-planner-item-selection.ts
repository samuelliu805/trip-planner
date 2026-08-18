"use client";

import { useMemo, useState } from "react";

import type { PlannerDay } from "@/features/itinerary/types";

export function usePlannerItemSelection(days: PlannerDay[]) {
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const selectedItem = useMemo(
    () =>
      selectedItemId
        ? days.flatMap(({ items }) => items).find(({ id }) => id === selectedItemId)
        : undefined,
    [days, selectedItemId],
  );

  return { selectedItem, selectedItemId, setSelectedItemId };
}
