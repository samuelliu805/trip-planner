import type { PlannerVariant } from "@/features/itinerary/types";

export type VariantMutationData = {
  variantId: string;
  variants: PlannerVariant[];
};

export type VariantMutationResult =
  | { data: VariantMutationData; error?: never; code?: never }
  | { data?: never; error: string; code?: "conflict" | "forbidden" | "unexpected" | "validation" };
