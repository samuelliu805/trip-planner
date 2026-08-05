"use client";

import { useMemo } from "react";

import type { PlannerVariant } from "@/features/itinerary/types";

import {
  finalizeVariantDecisionSummaries,
  reconcileDecisionSummaryProjections,
} from "./decision-summary-finalization";
import type { VariantDecisionSummary } from "./decision-summary-types";
import { useVariantDecisionSummaryProjection } from "./queries";

export type VariantDecisionSummaryUi = {
  available: boolean;
  error?: string;
  isLoading: boolean;
  retry: () => void;
  summaries: VariantDecisionSummary[];
};

export function useVariantDecisionSummary({
  enabled,
  tripId,
  variants,
}: {
  enabled: boolean;
  tripId: string;
  variants: PlannerVariant[];
}): VariantDecisionSummaryUi {
  const available = variants.length >= 2;
  const query = useVariantDecisionSummaryProjection(tripId, enabled && available);
  const summaries = useMemo(
    () =>
      finalizeVariantDecisionSummaries(reconcileDecisionSummaryProjections(variants, query.data)),
    [query.data, variants],
  );
  return {
    available,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.isError
          ? "The decision summary could not be loaded."
          : undefined,
    isLoading: enabled && available && query.isPending,
    retry: () => void query.refetch(),
    summaries,
  };
}
