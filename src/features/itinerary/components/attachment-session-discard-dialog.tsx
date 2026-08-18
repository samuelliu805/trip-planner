"use client";

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

export function AttachmentSessionDiscardDialog({
  error,
  onDiscard,
  onOpenChange,
  open,
  pending,
  uploadPending,
}: {
  error?: string;
  onDiscard: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  uploadPending: boolean;
}) {
  return (
    <AlertDialog onOpenChange={(next) => !pending && onOpenChange(next)} open={open}>
      <AlertDialogContent data-attachment-overlay="">
        <AlertDialogHeader>
          <AlertDialogTitle>Discard new files?</AlertDialogTitle>
          <AlertDialogDescription>
            {uploadPending
              ? "The upload will be canceled. New files from this edit session will be removed."
              : "New files from this edit session will be removed because the itinerary item was not saved."}
          </AlertDialogDescription>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending} type="button">
            Keep editing
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void onDiscard();
            }}
            type="button"
          >
            {pending ? "Removing…" : "Discard files"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
