"use client";

import { format, parseISO } from "date-fns";
import {
  CalendarDays,
  CircleCheck,
  MoreVertical,
  Pencil,
  RotateCcw,
  Share2,
  SquareArrowOutUpRight,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { countActiveSharePages, setTripStatus } from "@/features/trips/actions";
import { DeleteTripDialog } from "@/features/trips/components/delete-trip-dialog";
import { TripEditorScreen } from "@/features/trips/components/trip-editor-screen";
import { TripForm } from "@/features/trips/components/trip-form";
import { tripStatusOf, tripStatusToggle } from "@/features/trips/status";
import type { TripListEntry } from "@/features/trips/types";

function tripDateSummary(trip: TripListEntry) {
  if (trip.start_date && trip.end_date)
    return `${format(parseISO(trip.start_date), "MMM d, yyyy")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}`;
  return `${trip.day_count} planning ${trip.day_count === 1 ? "day" : "days"} · Dates TBD`;
}

function PrimaryRouteSummary({ trip }: { trip: TripListEntry }) {
  const primary = trip.route_variants.find(({ is_primary }) => is_primary);
  if (!primary)
    return <p className="mt-1 text-xs font-medium text-destructive">Primary unavailable</p>;

  return (
    <p className="mt-1 flex items-center justify-end gap-1.5 font-semibold">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: primary.color }}
      />
      <span className="max-w-32 truncate">{primary.name}</span>
    </p>
  );
}

export function TripCard({ trip }: { trip: TripListEntry }) {
  const router = useRouter();
  const [editorOpen, setEditorOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sharePageCount, setSharePageCount] = useState<number | null>(null);
  const [statusPending, startStatusChange] = useTransition();
  const status = tripStatusOf(trip);
  const toggle = tripStatusToggle(status);

  function afterMenu(open: () => void) {
    window.setTimeout(open, 0);
  }

  function confirmDelete() {
    setSharePageCount(null);
    setDeleteOpen(true);
    void countActiveSharePages(trip.id).then(setSharePageCount, () => setSharePageCount(0));
  }

  function changeStatus() {
    startStatusChange(async () => {
      await setTripStatus({ status: toggle.next, tripId: trip.id });
      router.refresh();
    });
  }

  return (
    <>
      <Card
        className={`relative h-full transition-shadow focus-within:shadow-md hover:shadow-md ${status === "done" ? "bg-muted/40" : ""}`}
      >
        <Link
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={`/trips/${trip.id}`}
        >
          <span className="sr-only">Open {trip.title}</span>
        </Link>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle className="truncate text-lg sm:text-xl">{trip.title}</CardTitle>
            <CardDescription className="mt-1 flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-4 shrink-0" />
              {tripDateSummary(trip)}
            </CardDescription>
            {status === "done" ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                <CircleCheck aria-hidden="true" className="size-3.5" /> Completed
              </p>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`Actions for ${trip.title}`}
                className="relative z-10 -mr-2 -mt-2 size-11 shrink-0 px-0"
                variant="ghost"
              >
                <MoreVertical aria-hidden="true" className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href={`/trips/${trip.id}`}>
                  <SquareArrowOutUpRight aria-hidden="true" className="size-4" /> Open planner
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => afterMenu(() => setEditorOpen(true))}>
                <Pencil aria-hidden="true" className="size-4" /> Edit trip
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/trips/${trip.id}?share=1`}>
                  <Share2 aria-hidden="true" className="size-4" /> Share settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={statusPending} onSelect={changeStatus}>
                {status === "done" ? (
                  <RotateCcw aria-hidden="true" className="size-4" />
                ) : (
                  <CircleCheck aria-hidden="true" className="size-4" />
                )}
                {toggle.label}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                onSelect={() => afterMenu(confirmDelete)}
              >
                <Trash2 aria-hidden="true" className="size-4" /> Delete trip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardHeader>
        <CardContent className="grid grid-cols-[1fr_auto] gap-4 border-t pt-4 text-sm">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Currency
            </p>
            <p className="mt-1 font-mono text-xs">{trip.currency}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Primary
            </p>
            <PrimaryRouteSummary trip={trip} />
          </div>
        </CardContent>
      </Card>

      <TripEditorScreen
        description="Rename the trip, change its length, or adjust dates and currency."
        onOpenChange={setEditorOpen}
        open={editorOpen}
        title="Trip settings"
      >
        <TripForm
          onSaved={() => {
            setEditorOpen(false);
            router.refresh();
          }}
          trip={trip}
        />
      </TripEditorScreen>
      <DeleteTripDialog
        activeSharePageCount={sharePageCount}
        onOpenChange={setDeleteOpen}
        open={deleteOpen}
        renderTrigger={false}
        title={trip.title}
        tripId={trip.id}
      />
    </>
  );
}
