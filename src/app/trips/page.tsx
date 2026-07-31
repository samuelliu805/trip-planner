import { format, parseISO } from "date-fns";
import { CalendarDays, MapPin, MoreVertical, Route } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CreateTripDialog } from "@/features/trips/components/create-trip-dialog";
import { listTrips } from "@/features/trips/data";

export const metadata = { title: "Trips" };

export default async function TripsPage() {
  const { data: trips, error } = await listTrips();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Trips</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">Create a trip and turn each day into a clear plan.</p>
        </div>
        <CreateTripDialog />
      </div>

      <div className="mt-8">
        <section aria-labelledby="trip-list-title">
          <h2 className="sr-only" id="trip-list-title">Your trips</h2>
          {error ? <Card><CardContent className="pt-6 text-sm text-destructive">We could not load your trips. Try refreshing the page.</CardContent></Card> : null}
          {!error && trips?.length === 0 ? (
            <Card className="border-dashed"><CardContent className="flex min-h-52 flex-col items-center justify-center text-center"><MapPin className="mb-4 size-7 text-primary" aria-hidden="true" /><p className="font-medium">No trips yet</p><p className="mt-1 max-w-xs text-sm text-muted-foreground">Create your first trip to generate its dates and default route.</p></CardContent></Card>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 lg:gap-6">
            {trips?.map((trip) => (
              <Card className="h-full" key={trip.id}>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-lg sm:text-xl"><Link className="hover:text-primary focus-visible:outline-none focus-visible:underline" href={`/trips/${trip.id}`}>{trip.title}</Link></CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-2"><CalendarDays className="size-4 shrink-0" aria-hidden="true" />{trip.start_date && trip.end_date ? `${format(parseISO(trip.start_date), "MMM d, yyyy")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}` : `${trip.day_count} planning ${trip.day_count === 1 ? "day" : "days"} · Dates TBD`}</CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button aria-label={`Actions for ${trip.title}`} className="-mr-2 -mt-2 size-11 shrink-0 px-0" variant="ghost"><MoreVertical aria-hidden="true" className="size-5" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild><Link href={`/trips/${trip.id}`}>Open Planner</Link></DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild><Link href={`/trips/${trip.id}`}>Trip settings</Link></DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent className="grid grid-cols-[1fr_auto] gap-4 border-t pt-4 text-sm">
                  <div className="flex min-w-0 gap-4">
                    <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timezone</p><p className="mt-1 truncate font-mono text-xs">{trip.timezone}</p></div>
                    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Currency</p><p className="mt-1 font-mono text-xs">{trip.currency}</p></div>
                  </div>
                  <div className="text-right"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Primary</p><p className="mt-1 flex items-center gap-1 font-semibold text-primary"><Route aria-hidden="true" className="size-4" /> Route A</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
