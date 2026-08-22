"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PublicShareDialog } from "@/features/sharing/components/public-share-dialog";
import { loadTripShareContext, type TripShareContext } from "@/features/trips/share-context";
import type { Tables } from "@/types/database";

/**
 * Share from the Trips list stays on the Trips list: this fetches the trip's routes and shareable
 * pages the first time it is asked for, then hands the same dialog the planner uses.
 */
export function TripShareLauncher({
  onOpenChange,
  siteUrl,
  trip,
}: {
  onOpenChange: (open: boolean) => void;
  siteUrl: string;
  trip: Tables<"trips">;
}) {
  const [context, setContext] = useState<TripShareContext>();
  const [error, setError] = useState<string>();

  // Mounted only while open, so one fetch per opening and no stale error to clear on the way in.
  useEffect(() => {
    let active = true;
    void loadTripShareContext(trip.id).then((result) => {
      if (!active) return;
      if ("error" in result) setError(result.error);
      else setContext(result);
    });
    return () => {
      active = false;
    };
  }, [trip.id]);

  if (context)
    return (
      <PublicShareDialog
        activeVariantId={context.variants.find(({ is_primary }) => is_primary)?.id ?? ""}
        initialLinks={context.links}
        initialOpen
        onOpenChange={onOpenChange}
        renderTrigger={false}
        siteUrl={siteUrl}
        trip={trip}
        variants={context.variants}
      />
    );

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share trip</DialogTitle>
          <DialogDescription>{error ?? "Loading this trip's share settings…"}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-24 items-center justify-center px-5 py-4">
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <LoaderCircle
              aria-hidden="true"
              className="size-6 animate-spin text-muted-foreground"
            />
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
