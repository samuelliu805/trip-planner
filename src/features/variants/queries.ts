"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type { PlannerVariant } from "@/features/itinerary/types";
import { requireData } from "@/features/itinerary/query-cache";

import {
  createRouteVariant,
  deleteRouteVariant,
  duplicateRouteVariant,
  loadRouteVariants,
  loadVariantDecisionSummary,
  loadVariantComparison,
  setPrimaryRouteVariant,
  updateRouteVariant,
} from "./actions";
import type { VariantComparisonProjection } from "./comparison-types";
import type { VariantDecisionSummaryProjection } from "./decision-summary-types";
import type { RouteVariantIdentityInput, UpdateRouteVariantInput } from "./schema";

export const variantListQueryKey = (tripId: string) => ["planner-variants", tripId] as const;
export const variantComparisonQueryKey = (tripId: string) =>
  ["variant-comparison", tripId] as const;
export const variantDecisionSummaryQueryKey = (tripId: string) =>
  ["variant-decision-summary", tripId] as const;

export function invalidateVariantComparison(client: QueryClient, tripId: string) {
  return client.invalidateQueries({ queryKey: variantComparisonQueryKey(tripId) });
}

export function invalidateVariantDecisionSummary(client: QueryClient, tripId: string) {
  return client.invalidateQueries({ queryKey: variantDecisionSummaryQueryKey(tripId) });
}

export function useRouteVariants(tripId: string, initialData: PlannerVariant[]) {
  return useQuery({
    initialData,
    queryFn: async () => requireData(await loadRouteVariants(tripId)),
    queryKey: variantListQueryKey(tripId),
    staleTime: 30_000,
  });
}

export function useVariantComparisonProjection(tripId: string, enabled: boolean) {
  return useQuery<VariantComparisonProjection[]>({
    enabled,
    queryFn: async () => requireData(await loadVariantComparison(tripId)),
    queryKey: variantComparisonQueryKey(tripId),
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

function useVariantMutation<TInput>(
  tripId: string,
  mutationFn: (
    input: TInput,
  ) => Promise<
    | { data: { variantId: string; variants: PlannerVariant[] }; error?: never }
    | { data?: never; error: string }
  >,
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => requireData(await mutationFn(input)),
    onSuccess: ({ variants }) => {
      client.setQueryData(variantListQueryKey(tripId), variants);
      void invalidateVariantComparison(client, tripId);
      void invalidateVariantDecisionSummary(client, tripId);
    },
  });
}

export function useCreateRouteVariant(tripId: string) {
  return useVariantMutation(tripId, createRouteVariant);
}

export function useDuplicateRouteVariant(tripId: string) {
  return useVariantMutation(tripId, duplicateRouteVariant);
}

export function useSetPrimaryRouteVariant(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: RouteVariantIdentityInput) =>
      requireData(await setPrimaryRouteVariant(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: variantListQueryKey(tripId) });
      const previous = client.getQueryData<PlannerVariant[]>(variantListQueryKey(tripId));
      client.setQueryData<PlannerVariant[]>(variantListQueryKey(tripId), (current) =>
        current?.map((variant) => ({
          ...variant,
          is_primary: variant.id === input.variantId,
        })),
      );
      return { previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(variantListQueryKey(tripId), context?.previous),
    onSuccess: ({ variants }) => client.setQueryData(variantListQueryKey(tripId), variants),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: variantListQueryKey(tripId) });
      void invalidateVariantComparison(client, tripId);
      void invalidateVariantDecisionSummary(client, tripId);
    },
  });
}

export function useDeleteRouteVariant(tripId: string) {
  return useVariantMutation(tripId, deleteRouteVariant);
}

export function useUpdateRouteVariant(tripId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateRouteVariantInput) =>
      requireData(await updateRouteVariant(input)),
    onMutate: async (input) => {
      await client.cancelQueries({ queryKey: variantListQueryKey(tripId) });
      const previous = client.getQueryData<PlannerVariant[]>(variantListQueryKey(tripId));
      client.setQueryData<PlannerVariant[]>(variantListQueryKey(tripId), (current) =>
        current?.map((variant) =>
          variant.id === input.variantId
            ? { ...variant, color: input.color.toLowerCase(), name: input.name.trim() }
            : variant,
        ),
      );
      return { previous };
    },
    onError: (_error, _input, context) =>
      client.setQueryData(variantListQueryKey(tripId), context?.previous),
    onSuccess: ({ variants }) => {
      client.setQueryData(variantListQueryKey(tripId), variants);
      void invalidateVariantComparison(client, tripId);
      void invalidateVariantDecisionSummary(client, tripId);
    },
  });
}
