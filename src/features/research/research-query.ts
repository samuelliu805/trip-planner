"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useResearchSync } from "./use-research-sync";

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
  const sync = useResearchSync(tripId);
  useEffect(() => {
    sync?.attach(initialData.items);
  }, [sync, initialData]);
  return useQuery({
    initialData,
    queryFn: async () => {
      const read = sync?.beginRead();
      const loaded = requireData(await loadResearchWorkspace({ tripId, variantId }));
      return sync ? { ...loaded, items: sync.reconcile(loaded.items, read) } : loaded;
    },
    queryKey: researchWorkspaceQueryKey(tripId, variantId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 15_000,
  });
}
