"use client";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { T } from "@/features/i18n/i18n-provider";

export type IdeaApplyMode = "existing" | "copy" | "blank";

export function IdeaApplyFooter({
  canApply,
  copyAnchor,
  journeyDateCount,
  mode,
  onApply,
  onModeChange,
  pending,
  remainingCount,
  retrying,
  selectedCount,
}: {
  canApply: boolean;
  copyAnchor: number | null;
  journeyDateCount: number;
  mode: IdeaApplyMode;
  onApply: () => void;
  onModeChange: (mode: IdeaApplyMode) => void;
  pending: boolean;
  remainingCount: number;
  retrying: boolean;
  selectedCount: number;
}) {
  return (
    <DialogFooter className="sm:flex-wrap">
      {mode === "existing" ? (
        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Button
            className="min-h-11 flex-1"
            disabled={pending}
            onClick={() => onModeChange("blank")}
            type="button"
            variant="outline"
          >
            <T message="Create empty Plan + idea" />
          </Button>
          {journeyDateCount > 0 ? (
            <Button
              className="min-h-11 flex-1"
              disabled={pending}
              onClick={() => onModeChange("copy")}
              type="button"
              variant="outline"
            >
              <T message="Copy Plan + idea" />
            </Button>
          ) : null}
        </div>
      ) : (
        <Button
          className="min-h-11 w-full"
          disabled={pending}
          onClick={() => onModeChange("existing")}
          type="button"
          variant="outline"
        >
          <T message="Back" />
        </Button>
      )}
      <Button
        className="min-h-11 w-full"
        disabled={mode === "existing" ? !canApply || !remainingCount : !copyAnchor || pending}
        onClick={onApply}
        type="button"
      >
        <T
          message={
            mode !== "existing"
              ? "Create Plan"
              : retrying
                ? "Retry remaining Plans"
                : selectedCount > 1
                  ? "Update selected Plans"
                  : journeyDateCount
                    ? "Update this Plan"
                    : "Add to Plan"
          }
        />
      </Button>
    </DialogFooter>
  );
}
