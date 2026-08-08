"use client";

import { LoaderCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function PlannerClearCellsDialog({
  error,
  itemCount,
  onCancel,
  onConfirm,
  pending,
}: {
  error?: string;
  itemCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog onOpenChange={(open) => !open && !pending && onCancel()} open={itemCount > 0}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear the selected cells?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes {itemCount}{" "}
            {itemCount === 1 ? "itinerary item" : "itinerary items"}. Saved day routes that use them
            will need editing.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Keep items</AlertDialogCancel>
          <Button aria-busy={pending} disabled={pending} onClick={onConfirm} variant="destructive">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {pending ? "Clearing…" : "Clear cells"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
