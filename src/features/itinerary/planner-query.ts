"use client";

import { usePlannerOutbox } from "./planner-outbox-provider";
import { useQuery } from "@tanstack/react-query";

import { loadPlannerWorkspace } from "@/features/itinerary/actions";
import { requireData } from "@/features/itinerary/query-cache";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import { usePlannerPersistence } from "@/features/itinerary/planner-persistence";
import { useVariantSync } from "../variants/use-variant-sync";

export const plannerQueryKey = (tripId: string, variantId: string) =>
  ["planner", tripId, variantId] as const;

export function usePlannerWorkspace(
  tripId: string,
  variantId: string,
  initialData?: PlannerWorkspace,
) {
  const persistence = usePlannerPersistence();
  const outbox = usePlannerOutbox();
  const variants = useVariantSync(tripId);
  const pending = variants?.queue.operations.some(
    (op) => op.id === variantId && (op.intent as { kind: string }).kind === "create",
  );
  return useQuery({
    enabled: !persistence && Boolean(variants) && !pending,
    initialData,
    queryFn: async () => {
      const workspace = requireData(await loadPlannerWorkspace(tripId, variantId));
      return outbox ? outbox.reconcile(workspace) : workspace;
    },
    queryKey: plannerQueryKey(tripId, variantId),
  });
}
