"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useActionState, useEffect } from "react";

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

function DeleteAction({
  checking,
  onPendingChange,
  pending,
}: {
  checking: boolean;
  onPendingChange?: (pending: boolean) => void;
  pending: boolean;
}) {
  const loading = checking || pending;

  return (
    <AlertDialogAction
      aria-busy={loading}
      disabled={loading}
      onClick={() => onPendingChange?.(true)}
      type="submit"
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        <Trash2 aria-hidden="true" className="size-4" />
      )}
      {checking ? "Checking…" : pending ? "Deleting…" : "Delete trip"}
    </AlertDialogAction>
  );
}

export function DeleteTripDialog({
  activeSharePageCount,
  onOpenChange,
  onPendingChange,
  open,
  renderTrigger = true,
  title,
  tripId,
}: {
  activeSharePageCount: number | null;
  onOpenChange?: (open: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
  open?: boolean;
  renderTrigger?: boolean;
  title: string;
  tripId: string;
}) {
  const checkingSharePages = activeSharePageCount === null;
  const [, action, pending] = useActionState(deleteTrip, {});

  useEffect(() => onPendingChange?.(pending), [onPendingChange, pending]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);

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
            {checkingSharePages ? (
              <span
                aria-live="polite"
                className="mt-3 flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-foreground"
                role="status"
              >
                <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
                Checking published Share Pages…
              </span>
            ) : activeSharePageCount ? (
              <span className="mt-3 block border-l-2 border-primary bg-primary/5 px-3 py-2 text-foreground">
                {activeSharePageCount} published{" "}
                {activeSharePageCount === 1 ? "Share Page" : "Share Pages"} and their permanent
                images will remain online as independent snapshots. They will no longer be
                updateable from this trip. Revoke them before deleting if they should stop working.
              </span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={action}>
          <input name="trip_id" type="hidden" value={tripId} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <DeleteAction
              checking={checkingSharePages}
              onPendingChange={onPendingChange}
              pending={pending}
            />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
