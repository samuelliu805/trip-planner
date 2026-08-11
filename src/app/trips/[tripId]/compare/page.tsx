import { notFound, redirect } from "next/navigation";

import { tripIdSchema } from "@/features/trips/schema";
import { parseResearchCategory, researchCategoryHref } from "@/features/research/urls";

type LegacyComparePageProps = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{
    category?: string;
    dayId?: string;
    itemId?: string;
    variant?: string;
  }>;
};

export default async function LegacyComparePage({ params, searchParams }: LegacyComparePageProps) {
  const [{ tripId }, query] = await Promise.all([params, searchParams]);
  if (!tripIdSchema.safeParse(tripId).success) notFound();
  redirect(
    researchCategoryHref(tripId, parseResearchCategory(query.category) ?? "flight", {
      dayId: query.dayId,
      itemId: query.itemId,
      variantId: query.variant,
    }),
  );
}
