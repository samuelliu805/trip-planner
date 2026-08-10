import { notFound } from "next/navigation";

import { CompareWorkspace } from "@/features/research/components/compare-workspace";
import { TripDetailRoute } from "@/features/research/components/trip-detail-route";
import { getCompareItems } from "@/features/research/data";
import { researchCategories, type ResearchCategory } from "@/features/research/types";
import { parseResearchCategory } from "@/features/research/urls";
import { getPlannerVariants } from "@/features/itinerary/data";
import { getTrip } from "@/features/trips/data";
import { tripIdSchema } from "@/features/trips/schema";
import { resolveActiveVariant } from "@/features/variants/active";
import { createClient } from "@/lib/supabase/server";

type ComparePageProps = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{
    category?: string;
    dayId?: string;
    itemId?: string;
    variant?: string;
  }>;
};

export default async function ComparePage({ params, searchParams }: ComparePageProps) {
  const [{ tripId }, query] = await Promise.all([params, searchParams]);
  if (!tripIdSchema.safeParse(tripId).success) notFound();
  const [{ data: trip, error }, variantsResult, itemsResult, supabase] = await Promise.all([
    getTrip(tripId),
    getPlannerVariants(tripId),
    getCompareItems(tripId),
    createClient(),
  ]);
  if (error || !trip) notFound();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.id !== trip.owner_id) notFound();
  if (variantsResult.error || !variantsResult.data)
    throw new Error(variantsResult.error ?? "Trip variants could not be loaded.");
  if (itemsResult.error) throw new Error(itemsResult.error);

  const resolution = resolveActiveVariant(variantsResult.data, query.variant);
  if (!resolution.activeVariant) throw new Error(resolution.error);
  const category = parseResearchCategory(query.category) ?? "flight";
  const context = {
    ...(tripIdSchema.safeParse(query.dayId).success && { dayId: query.dayId }),
    ...(tripIdSchema.safeParse(query.itemId).success && { itemId: query.itemId }),
  };
  const categoryHrefs = Object.fromEntries(
    researchCategories.map((value) => {
      const params = new URLSearchParams({
        category: value,
        variant: resolution.activeVariant!.id,
      });
      return [value, `/trips/${trip.id}/compare?${params.toString()}`];
    }),
  ) as Record<ResearchCategory, string>;

  return (
    <TripDetailRoute active="compare" tripId={trip.id} variantId={resolution.activeVariant.id}>
      <CompareWorkspace
        activeCategory={category}
        categoryHrefs={categoryHrefs}
        context={context}
        defaultCurrency={trip.currency}
        initialItems={itemsResult.data}
        tripId={trip.id}
        tripTitle={trip.title}
      />
    </TripDetailRoute>
  );
}
