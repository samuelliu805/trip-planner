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
import { T } from "@/features/i18n/i18n-provider";

import type { IdeaComparison } from "../idea-actions";

export function IdeaComparisonDeleteDialog({
  comparison,
  error,
  onClose,
  onDelete,
  pending,
}: {
  comparison?: IdeaComparison;
  error?: string;
  onClose: () => void;
  onDelete: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog open={!!comparison} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T message="Delete this comparison?" />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T message="Saved ideas and existing Plan items will remain." />
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="px-5 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>
            <T message="Keep it" />
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              onDelete();
            }}
          >
            <T message="Delete comparison" />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
