"use client";

import { RotateCcw } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { Button } from "@/components/ui/button";
import { Localized, T } from "@/features/i18n/i18n-provider";
import type { PlannerVariant } from "@/features/itinerary/types";

export function DeleteRouteVariantDialog({
  conflict,
  deletePending,
  error,
  onDismissError,
  onDismissNotice,
  onOpenChange,
  onReload,
  onRemove,
  notice,
  reloadPending,
  variant,
}: {
  conflict: boolean;
  deletePending: boolean;
  error?: string;
  onDismissError: () => void;
  onDismissNotice: () => void;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  onRemove: () => void;
  notice?: string;
  reloadPending: boolean;
  variant?: PlannerVariant;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={Boolean(variant)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T message={"Delete “"} />
            {variant?.name}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T
              message={
                " This permanently deletes this variant’s days, itinerary items, and saved routes. Shared trip places remain available to other Plans. "
              }
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AutoDismissAlert
          className="rounded-md text-sm shadow-none"
          onDismiss={onDismissError}
          role="alert"
          tone="destructive"
          value={error}
        >
          {error ? <Localized value={error} /> : null}
          {conflict ? (
            <Button
              className="ml-3 min-h-11"
              disabled={reloadPending}
              onClick={onReload}
              type="button"
              variant="outline"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <Localized value={reloadPending ? "Loading…" : "Reload latest"} />
            </Button>
          ) : null}
        </AutoDismissAlert>
        <AutoDismissAlert
          className="rounded-md text-sm shadow-none"
          onDismiss={onDismissNotice}
          tone="success"
          value={notice}
        >
          {notice ? <Localized value={notice} /> : null}
        </AutoDismissAlert>
        <AlertDialogFooter>
          <AlertDialogCancel className="min-h-11">
            <T message="Cancel" />
          </AlertDialogCancel>
          <Button
            className="min-h-11"
            disabled={deletePending}
            onClick={onRemove}
            variant="destructive"
          >
            <Localized value={deletePending ? "Deleting…" : "Delete Plan"} />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
