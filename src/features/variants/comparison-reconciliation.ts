import type { VariantComparisonIdentity, VariantComparisonProjection } from "./comparison-types";

export function reconcileVariantComparisonProjections(
  variants: VariantComparisonIdentity[],
  projections: VariantComparisonProjection[] | undefined,
) {
  const byId = new Map(projections?.map((projection) => [projection.variantId, projection]));
  return variants.map((variant): VariantComparisonProjection => {
    const projection = byId.get(variant.id);
    return {
      color: variant.color,
      days: projection?.days ?? [],
      isPrimary: variant.is_primary,
      knownCost: projection?.knownCost ?? [],
      name: variant.name,
      variantId: variant.id,
    };
  });
}

export function reconcileComparisonVisibility(
  variantIds: string[],
  activeVariantId: string,
  visibleVariantIds: ReadonlySet<string>,
  knownVariantIds: ReadonlySet<string>,
) {
  const visible = new Set<string>();
  for (const variantId of variantIds) {
    if (
      variantId === activeVariantId ||
      visibleVariantIds.has(variantId) ||
      !knownVariantIds.has(variantId)
    )
      visible.add(variantId);
  }
  if (variantIds.includes(activeVariantId)) visible.add(activeVariantId);
  return visible;
}
