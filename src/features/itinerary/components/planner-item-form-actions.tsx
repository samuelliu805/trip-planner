import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

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
import type { ItineraryItem } from "@/features/itinerary/types";

export function PlannerItemFormActions({
  error,
  item,
  lastStep,
  onBack,
  onNext,
  onRemove,
  pending,
  pendingLabel,
  primaryLabel,
  showBack,
}: {
  error?: string;
  item?: ItineraryItem;
  lastStep: boolean;
  onBack: () => void;
  onNext: () => void;
  onRemove: () => Promise<void>;
  pending: boolean;
  pendingLabel?: string;
  primaryLabel: string;
  showBack: boolean;
}) {
  return (
    <div className="planner-item-form-actions shrink-0 space-y-2 border-t bg-muted/40 px-5 py-3 sm:px-6">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex min-w-0 items-center gap-2">
        <Button
          className="min-h-11 px-3"
          disabled={!showBack}
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          <ChevronLeft className="size-4" /> Back
        </Button>
        {item ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                className="min-h-11"
                disabled={pending}
                size="sm"
                type="button"
                variant="ghost"
              >
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{item.title}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the item from the trip. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRemove}>Delete item</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {/* Next stays in place on the closing step so repeated clicks never chase the button. */}
          <Button
            className="min-h-11"
            disabled={lastStep}
            onClick={onNext}
            size="sm"
            type="button"
            variant="outline"
          >
            Next <ChevronRight className="size-4" />
          </Button>
          <Button
            aria-busy={pending}
            className="min-h-11"
            disabled={pending}
            size="sm"
            type="submit"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {pending ? (pendingLabel ?? "Saving…") : primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
