"use client";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import { isItineraryConflict } from "../query-cache";

export function PlannerItemConflictFeedback({
  error,
  editing,
  pending,
  onReload,
}: {
  error: unknown;
  editing: boolean;
  pending: boolean;
  onReload: () => Promise<void>;
}) {
  if (!isItineraryConflict(error)) return null;
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm text-muted-foreground">
        <T
          message={
            editing
              ? "Reloading replaces only this item and keeps the editor open."
              : "Reload the latest day and keep this editor open."
          }
        />
      </p>
      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
        <Button
          className="min-h-11"
          disabled={pending}
          onClick={() => void onReload()}
          type="button"
          variant="outline"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          <T message={pending ? "Loading…" : "Reload latest"} />
        </Button>
      </div>
    </div>
  );
}
