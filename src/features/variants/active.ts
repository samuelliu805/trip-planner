import type { PlannerVariant } from "@/features/itinerary/types";

export type ActiveVariantResolution =
  | { activeVariant: PlannerVariant; usedFallback: boolean }
  | { activeVariant?: never; error: string; usedFallback: false };

export function resolveActiveVariant(
  variants: PlannerVariant[],
  requestedVariantId?: string,
): ActiveVariantResolution {
  if (requestedVariantId) {
    const requested = variants.find(({ id }) => id === requestedVariantId);
    if (requested) return { activeVariant: requested, usedFallback: false };
  }

  const primaryVariants = variants.filter(({ is_primary }) => is_primary);
  if (primaryVariants.length !== 1) {
    return {
      error: "This trip does not have exactly one primary route variant.",
      usedFallback: false,
    };
  }

  return { activeVariant: primaryVariants[0], usedFallback: Boolean(requestedVariantId) };
}

export function variantHref(tripId: string, variantId: string) {
  return `/trips/${tripId}?variant=${variantId}`;
}
