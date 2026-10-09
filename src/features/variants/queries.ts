"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type { PlannerVariant } from "@/features/itinerary/types";
import { requireData } from "@/features/itinerary/query-cache";

import { loadRouteVariants, loadVariantDecisionSummary, loadVariantComparison } from "./actions";
import type { VariantComparisonProjection } from "./comparison-types";
import type { VariantDecisionSummaryProjection } from "./decision-summary-types";
import type {
  RouteVariantIdentityInput,
  UpdateRouteVariantInput,
  DeleteRouteVariantInput,
  CreateRouteVariantInput,
} from "./schema";
import type { VariantSyncIntent } from "./sync-intent";
import { plannerQueryKey } from "../itinerary/planner-query";
import type { PlannerWorkspace } from "../itinerary/types";
import { usePlannerPersistence } from "@/features/itinerary/planner-persistence";
import { variantListQueryKey } from "./variant-list-reload";
import { useVariantSync } from "./use-variant-sync";

export { refetchRouteVariantList, variantListQueryKey } from "./variant-list-reload";
export const variantComparisonQueryKey = (tripId: string, dayNumber?: number) =>
  ["variant-comparison", tripId, dayNumber ?? "overview"] as const;
export const variantDecisionSummaryQueryKey = (tripId: string) =>
  ["variant-decision-summary", tripId] as const;

export function invalidateVariantComparison(client: QueryClient, tripId: string) {
  return client.invalidateQueries({ queryKey: ["variant-comparison", tripId] });
}

export function invalidateVariantDecisionSummary(client: QueryClient, tripId: string) {
  return client.invalidateQueries({ queryKey: variantDecisionSummaryQueryKey(tripId) });
}

export function useRouteVariants(tripId: string, initialData: PlannerVariant[]) {
  const persistence = usePlannerPersistence();
  const runtime = useVariantSync(tripId, initialData);
  return useQuery({
    enabled: !persistence,
    initialData,
    queryFn: async () => {
      const generation = runtime?.beginRead();
      const variants = requireData(await loadRouteVariants(tripId));
      return runtime?.reconcile(variants, generation) ?? variants;
    },
    queryKey: variantListQueryKey(tripId),
    staleTime: 30_000,
  });
}

export function useVariantComparisonProjection(
  tripId: string,
  enabled: boolean,
  dayNumber?: number,
) {
  return useQuery<VariantComparisonProjection[]>({
    enabled,
    queryFn: async () => requireData(await loadVariantComparison(tripId, dayNumber)),
    queryKey: variantComparisonQueryKey(tripId, dayNumber),
    retry: false,
    staleTime: 30_000,
  });
}

export function useVariantDecisionSummaryProjection(tripId: string, enabled: boolean) {
  return useQuery<VariantDecisionSummaryProjection[]>({
    enabled,
    queryFn: async () => requireData(await loadVariantDecisionSummary(tripId)),
    queryKey: variantDecisionSummaryQueryKey(tripId),
    retry: false,
    staleTime: 30_000,
  });
}

function useDurableVariantMutation<TInput>(
  tripId: string,
  intent: (input: TInput) => VariantSyncIntent,
) {
  const client = useQueryClient();
  const runtime = useVariantSync(
    tripId,
    client.getQueryData<PlannerVariant[]>(variantListQueryKey(tripId)) ?? [],
  );
  return useMutation({
    networkMode: "always",
    mutationFn: async (input: TInput) => {
      if (!runtime)
        throw new Error("This Plan change could not be stored locally. Your draft is kept.");
      return runtime.accept(intent(input));
    },
    retry: false,
  });
}
function useCreatePlanMutation(tripId: string, duplicate: boolean) {
  const client = useQueryClient();
  return useDurableVariantMutation(tripId, (input: CreateRouteVariantInput) => {
    const source = client.getQueryData<PlannerWorkspace>(
      plannerQueryKey(tripId, input.sourceVariantId),
    );
    if (!source) throw new Error("Load the source Plan before copying it. Your draft is kept.");
    return {
      kind: "create",
      source,
      duplicate,
      input: {
        ...input,
        dayIds:
          input.dayIds ??
          Object.fromEntries(source.days.map((day) => [day.id, crypto.randomUUID()])),
        itemIds:
          input.itemIds ??
          (duplicate
            ? Object.fromEntries(
                source.days
                  .flatMap((day) => day.items)
                  .map((item) => [item.id, crypto.randomUUID()]),
              )
            : {}),
      },
    };
  });
}
export function useCreateRouteVariant(tripId: string) {
  return useCreatePlanMutation(tripId, false);
}
export function useDuplicateRouteVariant(tripId: string) {
  return useCreatePlanMutation(tripId, true);
}
export function useSetPrimaryRouteVariant(tripId: string) {
  return useDurableVariantMutation(tripId, (input: RouteVariantIdentityInput) => ({
    kind: "primary",
    input,
  }));
}
export function useDeleteRouteVariant(tripId: string) {
  return useDurableVariantMutation(tripId, (input: DeleteRouteVariantInput) => ({
    kind: "delete",
    input,
  }));
}
export function useUpdateRouteVariant(tripId: string) {
  return useDurableVariantMutation(tripId, (input: UpdateRouteVariantInput) => ({
    kind: "update",
    input,
  }));
}
