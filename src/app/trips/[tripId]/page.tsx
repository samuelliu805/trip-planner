import { format, parseISO } from "date-fns";
import { ArrowLeft, CalendarDays, Trash2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteTrip } from "@/features/trips/actions";
import { UpdateTripForm } from "@/features/trips/components/update-trip-form";
import { getPrimaryTripDays, getTrip } from "@/features/trips/data";
import { tripIdSchema } from "@/features/trips/schema";

type TripPageProps = { params: Promise<{ tripId: string }>; searchParams: Promise<{ error?: string }> };

export default async function TripPage({ params, searchParams }: TripPageProps) {
  const { tripId } = await params;
  if (!tripIdSchema.safeParse(tripId).success) notFound();

  const [{ data: trip, error }, { data: itinerary }, query] = await Promise.all([
    getTrip(tripId),
    getPrimaryTripDays(tripId),
    searchParams,
  ]);
  if (error || !trip) notFound();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
      <Button asChild variant="ghost"><Link href="/trips"><ArrowLeft className="size-4" aria-hidden="true" />All trips</Link></Button>
      <div className="mt-8 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">{itinerary?.variant.name ?? "Route A"}</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{trip.title}</h1><p className="mt-3 flex items-center gap-2 text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{format(parseISO(trip.start_date), "MMMM d")} – {format(parseISO(trip.end_date), "MMMM d, yyyy")}</p></div>
      </div>

      {query.error === "delete" ? <p className="mt-6 text-sm text-destructive" role="alert">The trip could not be deleted.</p> : null}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-4" aria-label="Trip days">
          {itinerary?.days.map((day) => (
            <Card key={day.id}><CardHeader><CardDescription>Day {day.day_number} · {format(parseISO(day.date), "EEEE, MMMM d")}</CardDescription><CardTitle>{day.title || "Plans to come"}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Itinerary item editing arrives in Phase 2.</CardContent></Card>
          ))}
        </section>

        <aside className="space-y-6">
          <Card><CardHeader><CardTitle>Trip settings</CardTitle><CardDescription>Dates are fixed after creation in this MVP.</CardDescription></CardHeader><CardContent><UpdateTripForm trip={trip} /></CardContent></Card>
          <Card className="border-destructive/30"><CardHeader><CardTitle className="text-base">Delete trip</CardTitle><CardDescription>This permanently removes the trip and its current plan.</CardDescription></CardHeader><CardContent><form action={deleteTrip}><input name="trip_id" type="hidden" value={trip.id} /><Button type="submit" variant="destructive"><Trash2 className="size-4" aria-hidden="true" />Delete trip</Button></form></CardContent></Card>
        </aside>
      </div>
    </main>
  );
}
