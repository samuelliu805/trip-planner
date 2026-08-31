import { notFound } from "next/navigation";

import { PlannerWorkspace } from "@/features/itinerary/components/planner-workspace";
import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { PublicShareDialog } from "@/features/sharing/components/public-share-dialog";
import { listPublicItineraryLinks } from "@/features/sharing/data";
import { getRequestSiteUrl } from "@/features/sharing/request-site-url";
import { getPlannerVariants, getPlannerWorkspace } from "@/features/itinerary/data";
import { TripForm } from "@/features/trips/components/trip-form";
import { getTrip } from "@/features/trips/data";
import { tripIdSchema } from "@/features/trips/schema";
import { resolveActiveVariant } from "@/features/variants/active";
import { getPlanResearchItems, getResearchPlanState } from "@/features/research/data";
import { getExchangeRateTable } from "@/features/research/exchange-rates.server";
import { getAuthProvider, getBackendCapabilities } from "@/platform/composition/server";

type TripPageProps = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ error?: string; settings?: string; share?: string; variant?: string }>;
};

export default async function TripPage({ params, searchParams }: TripPageProps) {
  const { tripId } = await params;
  if (!tripIdSchema.safeParse(tripId).success) notFound();

  const [
    { data: trip, error },
    variantsResult,
    researchItemsResult,
    query,
    exchangeRates,
    siteUrl,
  ] = await Promise.all([
    getTrip(tripId),
    getPlannerVariants(tripId),
    getPlanResearchItems(tripId),
    searchParams,
    getExchangeRateTable(),
    getRequestSiteUrl(),
  ]);
  if (error || !trip) notFound();
  if (variantsResult.error || !variantsResult.data)
    throw new Error(variantsResult.error ?? "The route variants could not be loaded.");
  if (researchItemsResult.error || !researchItemsResult.data)
    throw new Error(researchItemsResult.error ?? "Research items could not be loaded.");

  const resolution = resolveActiveVariant(variantsResult.data, query.variant);
  if (!resolution.activeVariant) throw new Error(resolution.error);
  const [workspaceResult, planState] = await Promise.all([
    getPlannerWorkspace(tripId, resolution.activeVariant.id),
    getResearchPlanState(tripId, resolution.activeVariant.id),
  ]);
  const { data: workspace, error: workspaceError } = workspaceResult;
  if (workspaceError || !workspace)
    throw new Error(workspaceError ?? "The selected route variant could not be loaded.");
  if (planState.error) throw new Error(planState.error);

  const user = await getAuthProvider().getCurrentUser();
  const owner = user?.id === trip.owner_id;
  const sharingEnabled = getBackendCapabilities().signedUrls;
  const shareLinks =
    owner && sharingEnabled ? await listPublicItineraryLinks(trip.id) : { data: [], error: null };
  return (
    <main className="trip-detail-page trip-planner-page flex h-dvh min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <PlannerMapProvider>
          <PlannerWorkspace
            accountEmail={user?.email ?? String(user?.metadata.username ?? "Account")}
            exchangeRates={exchangeRates}
            initialResearchItems={researchItemsResult.data}
            initialResearchSelections={planState.selections}
            initialSettingsOpen={query.settings === "1"}
            initialVariants={variantsResult.data}
            initialWorkspace={workspace}
            trip={trip}
            deleteError={query.error === "delete"}
            shareControls={
              owner && sharingEnabled ? (
                <PublicShareDialog
                  activeVariantId={workspace.variant.id}
                  initialOpen={query.share === "1"}
                  initialLinks={shareLinks.data}
                  key="trip-share-controls"
                  renderTrigger={false}
                  siteUrl={siteUrl}
                  trip={trip}
                  variants={variantsResult.data}
                />
              ) : null
            }
            settings={<TripForm trip={trip} />}
            shareAttachmentsEnabled={shareLinks.data.some(
              (link) => link.variantId === workspace.variant.id && link.showAttachments,
            )}
          />
        </PlannerMapProvider>
      </div>
    </main>
  );
}
