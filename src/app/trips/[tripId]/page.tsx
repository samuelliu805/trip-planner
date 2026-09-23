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
import {
  getAuthProvider,
  getBackendCapabilities,
  runServerReads,
} from "@/platform/composition/server";
import { appUserIdentityLabel } from "@/platform/contracts/auth";
import { retryTransientRead } from "@/platform/transient-read";

type TripPageProps = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{
    error?: string;
    item?: string;
    settings?: string;
    share?: string;
    variant?: string;
  }>;
};

export default async function TripPage({ params, searchParams }: TripPageProps) {
  const { tripId } = await params;
  if (!tripIdSchema.safeParse(tripId).success) notFound();

  const [
    [{ data: trip, error }, variantsResult, researchItemsResult],
    query,
    exchangeRates,
    siteUrl,
  ] = await Promise.all([
    runServerReads([
      () => retryTransientRead(() => getTrip(tripId)),
      () => retryTransientRead(() => getPlannerVariants(tripId)),
      () => retryTransientRead(() => getPlanResearchItems(tripId)),
    ]),
    searchParams,
    getExchangeRateTable(),
    getRequestSiteUrl(),
  ]);
  if (error) throw new Error(error.message);
  if (!trip) notFound();
  if (variantsResult.error || !variantsResult.data)
    throw new Error(variantsResult.error ?? "The route variants could not be loaded.");
  if (researchItemsResult.error || !researchItemsResult.data)
    throw new Error(researchItemsResult.error ?? "Research items could not be loaded.");

  let variants = variantsResult.data;
  const resolution = resolveActiveVariant(variants, query.variant);
  if (!resolution.activeVariant) throw new Error(resolution.error);
  let activeVariantId = resolution.activeVariant.id;
  let [workspaceResult, planState] = await runServerReads([
    () => retryTransientRead(() => getPlannerWorkspace(tripId, activeVariantId)),
    () => retryTransientRead(() => getResearchPlanState(tripId, activeVariantId)),
  ]);
  if (
    !workspaceResult.data &&
    workspaceResult.error === "The selected route variant was not found."
  ) {
    const latestVariants = await retryTransientRead(() => getPlannerVariants(tripId));
    if (latestVariants.error || !latestVariants.data)
      throw new Error(latestVariants.error ?? "The route variants could not be loaded.");
    const latestResolution = resolveActiveVariant(latestVariants.data, query.variant);
    if (!latestResolution.activeVariant) throw new Error(latestResolution.error);
    variants = latestVariants.data;
    activeVariantId = latestResolution.activeVariant.id;
    [workspaceResult, planState] = await runServerReads([
      () => retryTransientRead(() => getPlannerWorkspace(tripId, activeVariantId)),
      () => retryTransientRead(() => getResearchPlanState(tripId, activeVariantId)),
    ]);
  }
  const { data: workspace, error: workspaceError } = workspaceResult;
  if (workspaceError || !workspace)
    throw new Error(workspaceError ?? "The selected route variant could not be loaded.");
  if (planState.error) throw new Error(planState.error);

  const user = await getAuthProvider().getCurrentUser();
  const sharingEnabled = getBackendCapabilities().signedUrls;
  const shareLinks = sharingEnabled
    ? await listPublicItineraryLinks(trip.id)
    : { data: [], error: null };
  return (
    <main className="trip-detail-page trip-planner-page flex h-dvh min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <PlannerMapProvider>
          <PlannerWorkspace
            accountEmail={user ? appUserIdentityLabel(user) : "Account"}
            exchangeRates={exchangeRates}
            initialResearchItems={researchItemsResult.data}
            initialResearchSelections={planState.selections}
            initialEditorItemId={query.item}
            initialSettingsOpen={query.settings === "1"}
            initialVariants={variants}
            initialWorkspace={workspace}
            trip={trip}
            deleteError={query.error === "delete"}
            shareControls={
              sharingEnabled ? (
                <PublicShareDialog
                  activeVariantId={workspace.variant.id}
                  initialOpen={query.share === "1"}
                  initialLinks={shareLinks.data}
                  key="trip-share-controls"
                  renderTrigger={false}
                  siteUrl={siteUrl}
                  trip={trip}
                  variants={variants}
                />
              ) : null
            }
            settings={<TripForm key={trip.version} trip={trip} />}
            shareAttachmentsEnabled={shareLinks.data.some(
              (link) => link.variantId === workspace.variant.id && link.showAttachments,
            )}
          />
        </PlannerMapProvider>
      </div>
    </main>
  );
}
