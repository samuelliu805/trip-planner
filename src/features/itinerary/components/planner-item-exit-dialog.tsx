"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Guards accidental dismissals: a tap outside the modal must never drop entered details. */
export function PlannerItemExitDialog({
  editing,
  onDiscard,
  onOpenChange,
  open,
}: {
  editing: boolean;
  onDiscard: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T message={"Exit without saving?"} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Localized
              value={
                editing
                  ? "Your edits to this item have not been saved yet."
                  : "This item has not been added to the trip yet."
              }
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <T message={"Keep editing"} />
          </AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>
            <T message={"Exit without saving"} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
