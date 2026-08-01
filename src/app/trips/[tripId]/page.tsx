import { notFound } from "next/navigation";

import { PlannerWorkspace } from "@/features/itinerary/components/planner-workspace";
import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import { DeleteTripDialog } from "@/features/trips/components/delete-trip-dialog";
import { UpdateTripForm } from "@/features/trips/components/update-trip-form";
import { getTrip } from "@/features/trips/data";
import { tripIdSchema } from "@/features/trips/schema";

type TripPageProps = {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function TripPage({ params, searchParams }: TripPageProps) {
  const { tripId } = await params;
  if (!tripIdSchema.safeParse(tripId).success) notFound();

  const [{ data: trip, error }, { data: workspace }, query] = await Promise.all([
    getTrip(tripId),
    getPlannerWorkspace(tripId),
    searchParams,
  ]);
  if (error || !trip || !workspace) notFound();

  return (
    <main className="h-[calc(100dvh-4rem)] overflow-hidden">
      <PlannerMapProvider>
        <PlannerWorkspace
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
