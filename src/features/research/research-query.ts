"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";

import { requireData } from "@/features/itinerary/query-cache";

import { loadResearchWorkspace } from "./actions";
import type { ResearchWorkspaceSnapshot } from "./types";

export const researchWorkspaceQueryKey = (tripId: string, variantId: string) =>
  ["research-workspace", tripId, variantId] as const;

export function refreshResearchWorkspace(client: QueryClient, tripId: string, variantId: string) {
  return client.invalidateQueries({
    queryKey: researchWorkspaceQueryKey(tripId, variantId),
    refetchType: "all",
  });
}

export function useResearchWorkspace(
  tripId: string,
  variantId: string,
  initialData: ResearchWorkspaceSnapshot,
) {
  return useQuery({
    initialData,
    queryFn: async () => requireData(await loadResearchWorkspace({ tripId, variantId })),
    queryKey: researchWorkspaceQueryKey(tripId, variantId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
