"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { PlannerVariant } from "@/features/itinerary/types";

import {
  reconcileComparisonVisibility,
  reconcileVariantComparisonProjections,
} from "./comparison-normalization";
import {
  deriveVariantComparisonPresentation,
  visibleComparisonPresentations,
} from "./comparison-presentation";
import type { VariantComparisonPresentation } from "./comparison-types";
import { useVariantComparisonProjection } from "./queries";

export type VariantComparisonUi = {
  available: boolean;
  blockingReason?: string;
  dayNumber?: number;
  error?: string;
  isLoading: boolean;
  presentations: VariantComparisonPresentation[];
  retry: () => void;
  toggleVariant: (variantId: string) => void;
  visiblePresentations: VariantComparisonPresentation[];
  visibleVariantIds: ReadonlySet<string>;
};

export function useVariantComparison({
  activeVariantId,
  dayNumber,
  dayRouteEditing,
  enabled,
  tripId,
  variants,
}: {
  activeVariantId: string;
  dayNumber?: number;
  dayRouteEditing: boolean;
  enabled: boolean;
  tripId: string;
  variants: PlannerVariant[];
}): VariantComparisonUi {
  const query = useVariantComparisonProjection(tripId, enabled, dayNumber);
  const knownVariantIds = useRef(new Set(variants.map(({ id }) => id)));
  const [visibleVariantIds, setVisibleVariantIds] = useState<Set<string>>(
    () => new Set(variants.map(({ id }) => id)),
  );
  const variantIdsKey = variants.map(({ id }) => id).join("|");

  useEffect(() => {
    const currentIds = variantIdsKey ? variantIdsKey.split("|") : [];
    const previouslyKnownIds = knownVariantIds.current;
    setVisibleVariantIds((current) => {
      const next = reconcileComparisonVisibility(
        currentIds,
        activeVariantId,
        current,
        previouslyKnownIds,
      );
      return next.size === current.size && [...next].every((id) => current.has(id))
        ? current
        : next;
    });
    knownVariantIds.current = new Set(currentIds);
  }, [activeVariantId, variantIdsKey]);

  const projections = useMemo(
    () => reconcileVariantComparisonProjections(variants, query.data),
    [query.data, variants],
  );
  const presentations = useMemo(
    () =>
      projections.map((projection) =>
        deriveVariantComparisonPresentation(projection, activeVariantId, dayNumber),
      ),
    [activeVariantId, dayNumber, projections],
  );
  const visiblePresentations = useMemo(
    () => visibleComparisonPresentations(presentations, visibleVariantIds, activeVariantId),
    [activeVariantId, presentations, visibleVariantIds],
  );
  const available = variants.length >= 2;
  const blockingReason = !available
    ? "Compare requires at least two route variants. Add another variant to use Decision summary."
    : dayRouteEditing
      ? "Discard or save the open Day route draft before comparing variants."
      : undefined;

  return {
    available,
    blockingReason,
    dayNumber,
    error:
      query.error instanceof Error
        ? query.error.message
        : query.isError
          ? "The route comparison could not be loaded."
          : undefined,
    isLoading: enabled && query.isPending,
    presentations,
    retry: () => void query.refetch(),
    toggleVariant: (variantId) => {
      if (
        variantId === activeVariantId ||
        !presentations.some((presentation) => presentation.variantId === variantId)
      )
        return;
      setVisibleVariantIds((current) => {
        const next = new Set(current);
        if (next.has(variantId)) next.delete(variantId);
        else next.add(variantId);
        next.add(activeVariantId);
        return next;
      });
    },
    visiblePresentations,
    visibleVariantIds,
  };
}
