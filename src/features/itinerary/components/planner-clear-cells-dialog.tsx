"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
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
  onReloadLatest,
  pending,
  reloadPending,
  conflict,
}: {
  error?: string;
  itemCount: number;
  onCancel: () => void;
  onConfirm: () => void;
  onReloadLatest: () => Promise<void>;
  pending: boolean;
  reloadPending: boolean;
  conflict: boolean;
}) {
  const { t } = useI18n();
  return (
    <AlertDialog onOpenChange={(open) => !open && !pending && onCancel()} open={itemCount > 0}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T message={"Clear the selected cells?"} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "This permanently deletes {count} itinerary item(s). Saved day routes that use them will need editing.",
              { count: itemCount },
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            <Localized value={error} />
          </p>
        ) : null}
        {conflict ? (
          <Button
            className="mx-5 min-h-11 sm:mx-6"
            disabled={reloadPending}
            onClick={() => void onReloadLatest()}
            type="button"
            variant="outline"
          >
            <Localized value={reloadPending ? "Loading…" : "Reload latest"} />
          </Button>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            <T message={"Keep items"} />
          </AlertDialogCancel>
          <Button aria-busy={pending} disabled={pending} onClick={onConfirm} variant="destructive">
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            <Localized value={pending ? "Clearing…" : "Clear cells"} />
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
