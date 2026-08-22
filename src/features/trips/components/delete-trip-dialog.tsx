"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { deleteTrip } from "@/features/trips/actions";

function DeleteAction() {
  const { pending } = useFormStatus();

  return (
    <AlertDialogAction disabled={pending} type="submit">
      {pending ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <Trash2 aria-hidden="true" className="size-4" />
      )}
      {pending ? "Deleting…" : "Delete trip"}
    </AlertDialogAction>
  );
}

export function DeleteTripDialog({
  activeSharePageCount,
  onOpenChange,
  open,
  renderTrigger = true,
  title,
  tripId,
}: {
  activeSharePageCount: number | null;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  renderTrigger?: boolean;
  title: string;
  tripId: string;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      {renderTrigger ? (
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 aria-hidden="true" className="size-4" /> Delete Trip
          </Button>
        </AlertDialogTrigger>
      ) : null}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl font-semibold">Delete “{title}”?</AlertDialogTitle>
          <AlertDialogDescription className="text-sm leading-6 text-muted-foreground">
            This permanently removes the trip, its routes, and generated trip days. This action
            cannot be undone.
            {activeSharePageCount ? (
              <span className="mt-3 block border-l-2 border-primary bg-primary/5 px-3 py-2 text-foreground">
                {activeSharePageCount} published{" "}
                {activeSharePageCount === 1 ? "Share Page" : "Share Pages"} and their permanent
                images will remain online as independent snapshots. They will no longer be
                updateable from this trip. Revoke them before deleting if they should stop working.
              </span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={deleteTrip}>
          <input name="trip_id" type="hidden" value={tripId} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <DeleteAction />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
