import { Localized, T } from "@/features/i18n/i18n-provider";
import { MapPin } from "lucide-react";
import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { CreateTripButton } from "@/features/trips/components/create-trip-button";
import { TripCard } from "@/features/trips/components/trip-card";
import { TripStatusFilterTabs } from "@/features/trips/components/trip-status-filter";
import { listTrips } from "@/features/trips/data";
import { getRequestLocale } from "@/features/i18n/server";
import { translateMessage } from "@/features/i18n/translate";
import { resolveTripStatusFilter, type TripStatusFilter } from "@/features/trips/status";
import type { TripListEntry } from "@/features/trips/types";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: translateMessage(locale, "Trips") };
}

const emptyCopy: Record<TripStatusFilter, { body: string; title: string }> = {
  all: {
    body: "Create your first trip to generate its dates and default route.",
    title: "No trips yet",
  },
  done: {
    body: "Trips you complete collect here, out of the way but never deleted.",
    title: "No completed trips yet",
  },
  open: {
    body: "Create a trip, or switch to Completed to revisit a finished one.",
    title: "No active trips",
  },
};

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = resolveTripStatusFilter(status);
  const { data: trips, error } = await listTrips(filter);
  const empty = emptyCopy[filter];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          <T message={"Trips"} />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          <T message={" Create a trip and turn each day into a clear plan. "} />
        </p>
      </div>

      <div className="mt-6">
        <TripStatusFilterTabs action={<CreateTripButton />} active={filter}>
          <h2 className="sr-only" id="trip-list-title">
            <T message={" Your trips "} />
          </h2>
          {error ? (
            <Card>
              <CardContent className="pt-6 text-sm text-destructive">
                <T message={" We could not load your trips. Try refreshing the page. "} />
              </CardContent>
            </Card>
          ) : null}
          {!error && trips?.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex min-h-52 flex-col items-center justify-center text-center">
                <MapPin aria-hidden="true" className="mb-4 size-7 text-primary" />
                <p className="font-medium">
                  <Localized value={empty.title} />
                </p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  <Localized value={empty.body} />
                </p>
              </CardContent>
            </Card>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
            {trips?.map((trip) => (
              <TripCard key={trip.id} trip={trip as TripListEntry} />
            ))}
          </div>
        </TripStatusFilterTabs>
      </div>
    </main>
  );
}
