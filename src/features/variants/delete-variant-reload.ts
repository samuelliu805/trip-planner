import type { PlannerVariant } from "@/features/itinerary/types";

export function buildDeleteVariantInput(
  tripId: string,
  variant: PlannerVariant,
  operationId: string,
) {
  return {
    expectedContentVersion: variant.content_version,
    expectedDaysVersion: variant.days_version,
    expectedItemsVersion: variant.items_version,
    expectedVersion: variant.version,
    operationId,
    tripId,
    variantId: variant.id,
  };
}

export function findRefreshedDeleteVariant(
  variants: PlannerVariant[] | undefined,
  variantId: string,
) {
  return variants?.find(({ id }) => id === variantId);
}

export function resolveDeleteVariantReload(
  variants: PlannerVariant[] | undefined,
  variantId: string,
) {
  const refreshedVariant = findRefreshedDeleteVariant(variants, variantId);
  return refreshedVariant
    ? {
        notice: "Latest Plan loaded. You can retry deletion." as const,
        refreshedVariant,
      }
    : {
        notice: "That Plan was already deleted. The latest Plans are now visible." as const,
        refreshedVariant: undefined,
      };
}

export function resolveManageVariantReload(
  variants: PlannerVariant[] | undefined,
  deleteVariantId?: string,
) {
  return deleteVariantId
    ? resolveDeleteVariantReload(variants, deleteVariantId)
    : {
        notice: "Latest Plans loaded. You can retry setting the primary Plan." as const,
        refreshedVariant: undefined,
      };
}
