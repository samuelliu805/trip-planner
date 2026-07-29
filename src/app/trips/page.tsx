import { format, parseISO } from "date-fns";
import { CalendarDays, MapPin } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateTripForm } from "@/features/trips/components/create-trip-form";
import { listTrips } from "@/features/trips/data";

export const metadata = { title: "Trips" };

export default async function TripsPage() {
  const { data: trips, error } = await listTrips();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Your workspace</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Trips</h1>
        <p className="mt-3 text-muted-foreground">Create a trip and turn each day into a clear plan.</p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="trip-list-title">
          <h2 className="sr-only" id="trip-list-title">Your trips</h2>
          {error ? <Card><CardContent className="pt-6 text-sm text-destructive">We could not load your trips. Try refreshing the page.</CardContent></Card> : null}
          {!error && trips?.length === 0 ? (
            <Card className="border-dashed"><CardContent className="flex min-h-52 flex-col items-center justify-center text-center"><MapPin className="mb-4 size-7 text-primary" aria-hidden="true" /><p className="font-medium">No trips yet</p><p className="mt-1 max-w-xs text-sm text-muted-foreground">Create your first trip to generate its dates and default route.</p></CardContent></Card>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {trips?.map((trip) => (
              <Link className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href={`/trips/${trip.id}`} key={trip.id}>
                <Card className="h-full transition-colors group-hover:border-primary/50">
                  <CardHeader>
                    <CardTitle className="text-xl">{trip.title}</CardTitle>
                    <CardDescription className="flex items-center gap-2"><CalendarDays className="size-4" aria-hidden="true" />{format(parseISO(trip.start_date), "MMM d")} – {format(parseISO(trip.end_date), "MMM d, yyyy")}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{trip.timezone} · {trip.currency}</CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <aside>
          <Card className="lg:sticky lg:top-8">
            <CardHeader><CardTitle>Create a trip</CardTitle><CardDescription>Route A and one section per date are created automatically.</CardDescription></CardHeader>
            <CardContent><CreateTripForm /></CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
