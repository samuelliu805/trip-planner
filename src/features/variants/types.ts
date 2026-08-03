import type { PlannerVariant } from "@/features/itinerary/types";

export type VariantMutationData = {
  variantId: string;
  variants: PlannerVariant[];
};

export type VariantMutationResult =
  { data: VariantMutationData; error?: never } | { data?: never; error: string };
