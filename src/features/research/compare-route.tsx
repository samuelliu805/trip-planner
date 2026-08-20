import { notFound } from "next/navigation";

import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { PublicShareDialog } from "@/features/sharing/components/public-share-dialog";
import { listPublicItineraryLinks } from "@/features/sharing/data";
import { getRequestSiteUrl } from "@/features/sharing/request-site-url";
import { DeleteTripDialog } from "@/features/trips/components/delete-trip-dialog";
import { TripSettingsAppBar } from "@/features/trips/components/trip-settings-app-bar";
import { UpdateTripForm } from "@/features/trips/components/update-trip-form";
import { RouteVariantControls } from "@/features/variants/components/route-variant-controls";
import { getPlannerVariants } from "@/features/itinerary/data";
import { getTrip } from "@/features/trips/data";
import { tripIdSchema } from "@/features/trips/schema";
import { resolveActiveVariant } from "@/features/variants/active";
import { createClient } from "@/lib/supabase/server";

import { CompareWorkspace } from "./components/compare-workspace";
import { TripDetailRoute } from "./components/trip-detail-route";
import { getCompareItems, getResearchPlanSnapshot, getResearchPlanState } from "./data";
import { researchCategories, type ResearchCategory } from "./types";
import { researchCategoryHref } from "./urls";

export type ResearchCompareQuery = {
  dayId?: string;
  itemId?: string;
  variant?: string;
};

export async function ResearchCompareRoute({
  category,
  query,
  tripId,
}: {
  category: ResearchCategory;
  query: ResearchCompareQuery;
  tripId: string;
}) {
  const [{ data: trip, error }, variantsResult, itemsResult, supabase, siteUrl] = await Promise.all(
    [
      getTrip(tripId),
      getPlannerVariants(tripId),
      getCompareItems(tripId),
      createClient(),
      getRequestSiteUrl(),
    ],
  );
  if (error || !trip) notFound();
  const { data: authData } = await supabase.auth.getUser();
  if (authData.user?.id !== trip.owner_id) notFound();
  if (variantsResult.error || !variantsResult.data)
    throw new Error(variantsResult.error ?? "Trip variants could not be loaded.");
  if (itemsResult.error) throw new Error(itemsResult.error);

  const resolution = resolveActiveVariant(variantsResult.data, query.variant);
  if (!resolution.activeVariant) throw new Error(resolution.error);
  const [planResult, planState, shareLinks] = await Promise.all([
    getResearchPlanSnapshot(trip.id, resolution.activeVariant.id),
    getResearchPlanState(trip.id, resolution.activeVariant.id),
    listPublicItineraryLinks(trip.id),
  ]);
  if (planResult.error || !planResult.data)
    throw new Error(planResult.error ?? "The selected Plan could not be loaded.");
  if (planState.error) throw new Error(planState.error);
  const context = {
    ...(tripIdSchema.safeParse(query.dayId).success && { dayId: query.dayId }),
    ...(tripIdSchema.safeParse(query.itemId).success && { itemId: query.itemId }),
  };
  const categoryHrefs = Object.fromEntries(
    researchCategories.map((value) => [
      value,
      researchCategoryHref(trip.id, value, {
        ...context,
        variantId: resolution.activeVariant!.id,
      }),
    ]),
  ) as Record<ResearchCategory, string>;

  return (
    <TripDetailRoute
      appBar={
        <TripSettingsAppBar
          accountEmail={authData.user?.email ?? "Account"}
          active="compare"
          researchCategory={category}
          shareControls={
            <PublicShareDialog
              activeVariantId={resolution.activeVariant.id}
              initialLinks={shareLinks.data}
              renderTrigger={false}
              siteUrl={siteUrl}
              trip={trip}
              variants={variantsResult.data}
            />
          }
          title={trip.title}
          tripId={trip.id}
          variantControls={
            <RouteVariantControls
              activeSection="compare"
              activeVariantId={resolution.activeVariant.id}
              researchCategory={category}
              title={trip.title}
              tripId={trip.id}
              variants={variantsResult.data}
            />
          }
          variantId={resolution.activeVariant.id}
          settings={
            <div className="space-y-6">
              <UpdateTripForm trip={trip} />
              <div className="border-t pt-5">
                <DeleteTripDialog
                  activeSharePageCount={shareLinks.data.length}
                  title={trip.title}
                  tripId={trip.id}
                />
              </div>
            </div>
          }
        />
      }
    >
      <PlannerMapProvider>
        <CompareWorkspace
          activeCategory={category}
          categoryHrefs={categoryHrefs}
          context={context}
          defaultCurrency={trip.currency}
          initialApplications={planState.applications}
          initialCurrentApplicationIds={planState.currentApplicationIds}
          initialItems={itemsResult.data}
          initialSelections={planState.selections}
          key={`${resolution.activeVariant.id}:${planState.currentApplicationIds.join(",")}`}
          plan={planResult.data}
          tripId={trip.id}
          variantName={resolution.activeVariant.name}
        />
      </PlannerMapProvider>
    </TripDetailRoute>
  );
}
