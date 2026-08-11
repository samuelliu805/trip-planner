import { notFound } from "next/navigation";

import { ResearchCompareRoute, type ResearchCompareQuery } from "@/features/research/compare-route";
import { parseResearchCategoryRouteSegment } from "@/features/research/urls";
import { tripIdSchema } from "@/features/trips/schema";

type CategoryComparePageProps = {
  params: Promise<{ category: string; tripId: string }>;
  searchParams: Promise<ResearchCompareQuery>;
};

export default async function CategoryComparePage({
  params,
  searchParams,
}: CategoryComparePageProps) {
  const [{ category: segment, tripId }, query] = await Promise.all([params, searchParams]);
  const category = parseResearchCategoryRouteSegment(segment);
  if (!tripIdSchema.safeParse(tripId).success || !category) notFound();
  return <ResearchCompareRoute category={category} query={query} tripId={tripId} />;
}
