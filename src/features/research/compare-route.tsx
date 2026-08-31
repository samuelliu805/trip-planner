import { notFound } from "next/navigation";

import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { PublicShareDialog } from "@/features/sharing/components/public-share-dialog";
import { listPublicItineraryLinks } from "@/features/sharing/data";
import { getRequestSiteUrl } from "@/features/sharing/request-site-url";
import { TripForm } from "@/features/trips/components/trip-form";
import { TripSettingsAppBar } from "@/features/trips/components/trip-settings-app-bar";
import { RouteVariantControls } from "@/features/variants/components/route-variant-controls";
import { getPlannerVariants } from "@/features/itinerary/data";
import { getTrip } from "@/features/trips/data";
import { tripIdSchema } from "@/features/trips/schema";
import { resolveActiveVariant } from "@/features/variants/active";
import { getAuthProvider, getBackendCapabilities } from "@/platform/composition/server";

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
  const [{ data: trip, error }, variantsResult, itemsResult, user, siteUrl] = await Promise.all([
    getTrip(tripId),
    getPlannerVariants(tripId),
    getCompareItems(tripId),
    getAuthProvider().getCurrentUser(),
    getRequestSiteUrl(),
  ]);
  if (error || !trip) notFound();
  if (user?.id !== trip.owner_id) notFound();
  if (variantsResult.error || !variantsResult.data)
    throw new Error(variantsResult.error ?? "Trip variants could not be loaded.");
  if (itemsResult.error) throw new Error(itemsResult.error);

  const resolution = resolveActiveVariant(variantsResult.data, query.variant);
  if (!resolution.activeVariant) throw new Error(resolution.error);
  const sharingEnabled = getBackendCapabilities().signedUrls;
  const [planResult, planState, shareLinks] = await Promise.all([
    getResearchPlanSnapshot(trip.id, resolution.activeVariant.id),
    getResearchPlanState(trip.id, resolution.activeVariant.id),
    sharingEnabled ? listPublicItineraryLinks(trip.id) : Promise.resolve({ data: [], error: null }),
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
          accountEmail={user.email ?? String(user.metadata.username ?? "Account")}
          active="compare"
          researchCategory={category}
          shareControls={
            sharingEnabled ? (
              <PublicShareDialog
                activeVariantId={resolution.activeVariant.id}
                initialLinks={shareLinks.data}
                renderTrigger={false}
                siteUrl={siteUrl}
                trip={trip}
                variants={variantsResult.data}
              />
            ) : null
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
          settings={<TripForm trip={trip} />}
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
