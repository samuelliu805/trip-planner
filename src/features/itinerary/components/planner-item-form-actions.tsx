import { LoaderCircle } from "lucide-react";

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
import type { ItineraryItem, ItineraryItemType } from "@/features/itinerary/types";

export function PlannerItemFormActions({
  canSave,
  error,
  item,
  onCancel,
  onRemove,
  pending,
  pendingLabel,
  type,
}: {
  canSave: boolean;
  error: Error | null;
  item?: ItineraryItem;
  onCancel: () => void;
  onRemove: () => Promise<void>;
  pending: boolean;
  pendingLabel?: string;
  type: ItineraryItemType;
}) {
  return (
    <div
      className="shrink-0 space-y-2 border-t bg-background px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      data-planner-editor-actions=""
    >
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div>
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
        </div>
        <div className="flex min-w-0 gap-2">
          <Button className="min-h-11" onClick={onCancel} size="sm" type="button" variant="ghost">
            Cancel
          </Button>
          <Button
            aria-busy={pending}
            className="min-h-11"
            disabled={pending || !canSave}
            size="sm"
            type="submit"
          >
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {pending
              ? (pendingLabel ?? "Saving…")
              : item
                ? "Save"
                : ["activity", "meal"].includes(type)
                  ? "Next: place item"
                  : "Add item"}
          </Button>
        </div>
      </div>
    </div>
  );
}
