import { notFound } from "next/navigation";

import { PlannerWorkspace } from "@/features/itinerary/components/planner-workspace";
import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { getPlannerVariants, getPlannerWorkspace } from "@/features/itinerary/data";
import { DeleteTripDialog } from "@/features/trips/components/delete-trip-dialog";
import { UpdateTripForm } from "@/features/trips/components/update-trip-form";
import { getTrip } from "@/features/trips/data";
import { tripIdSchema } from "@/features/trips/schema";
import { resolveActiveVariant } from "@/features/variants/active";

type TripPageProps = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ error?: string; variant?: string }>;
};

export default async function TripPage({ params, searchParams }: TripPageProps) {
  const { tripId } = await params;
  if (!tripIdSchema.safeParse(tripId).success) notFound();

  const [{ data: trip, error }, variantsResult, query] = await Promise.all([
    getTrip(tripId),
    getPlannerVariants(tripId),
    searchParams,
  ]);
  if (error || !trip) notFound();
  if (variantsResult.error || !variantsResult.data)
    throw new Error(variantsResult.error ?? "The route variants could not be loaded.");

  const resolution = resolveActiveVariant(variantsResult.data, query.variant);
  if (!resolution.activeVariant) throw new Error(resolution.error);
  const { data: workspace, error: workspaceError } = await getPlannerWorkspace(
    tripId,
    resolution.activeVariant.id,
  );
  if (workspaceError || !workspace)
    throw new Error(workspaceError ?? "The selected route variant could not be loaded.");

  return (
    <main className="h-[calc(100dvh-4rem)] overflow-hidden">
      <PlannerMapProvider>
        <PlannerWorkspace
          initialVariants={variantsResult.data}
          initialWorkspace={workspace}
          trip={trip}
          deleteError={query.error === "delete"}
          settings={
            <div className="space-y-6">
              <UpdateTripForm trip={trip} />
              <div className="border-t pt-5">
                <DeleteTripDialog title={trip.title} tripId={trip.id} />
              </div>
            </div>
          }
        />
      </PlannerMapProvider>
    </main>
  );
}
