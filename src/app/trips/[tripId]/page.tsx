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
import { createClient } from "@/lib/supabase/server";

type TripPageProps = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ settings?: string; share?: string; variant?: string }>;
};

export default async function TripPage({ params, searchParams }: TripPageProps) {
  const { tripId } = await params;
  if (!tripIdSchema.safeParse(tripId).success) notFound();

  const [{ data: trip, error }, variantsResult, researchItems, query, exchangeRates, siteUrl] =
    await Promise.all([
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

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const owner = authData.user?.id === trip.owner_id;
  const shareLinks = owner ? await listPublicItineraryLinks(trip.id) : { data: [], error: null };
  return (
    <main className="trip-detail-page trip-planner-page flex h-dvh min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <PlannerMapProvider>
          <PlannerWorkspace
            accountEmail={authData.user?.email ?? "Account"}
            exchangeRates={exchangeRates}
            initialResearchItems={researchItems}
            initialResearchSelections={planState.selections}
            initialSettingsOpen={query.settings === "1"}
            initialVariants={variantsResult.data}
            initialWorkspace={workspace}
            trip={trip}
            shareControls={
              owner ? (
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
