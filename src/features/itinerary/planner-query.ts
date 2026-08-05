"use client";

import { useQuery } from "@tanstack/react-query";

import { loadPlannerWorkspace } from "@/features/itinerary/actions";
import { requireData } from "@/features/itinerary/query-cache";
import type { PlannerWorkspace } from "@/features/itinerary/types";

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
