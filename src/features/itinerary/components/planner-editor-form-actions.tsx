import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shared action layout for stepped and single-page editor forms. */
export function PlannerEditorFormActions({
  alternateSaveLabel,
  backDisabled = false,
  cancelLabel = "Cancel",
  compactActions = false,
  onCancel,
  onBack,
  onNext,
  nextDisabled = false,
  pending,
  pendingLabel,
  saveDisabled = false,
  saveLabel = "Save",
}: {
  alternateSaveLabel?: string;
  backDisabled?: boolean;
  cancelLabel?: string;
  compactActions?: boolean;
  nextDisabled?: boolean;
  onBack?: () => void;
  onCancel?: () => void;
  onNext?: () => void;
  pending: boolean;
  pendingLabel: string;
  saveDisabled?: boolean;
  saveLabel?: string;
}) {
  const saveButton = (
    <Button
      aria-busy={pending}
      className="min-h-11 min-w-0 font-semibold shadow-sm"
      disabled={pending || saveDisabled}
      size="sm"
      type="submit"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : saveLabel}
    </Button>
  );
  const splitCancelAndSave = Boolean(onCancel && !onBack && !onNext && !alternateSaveLabel);

  return (
    <div
      className={`planner-item-form-actions min-w-0 space-y-3 border-t ${compactActions ? "mt-6 pt-4" : "mt-10 pt-6"}`}
    >
      {splitCancelAndSave ? (
        <div className="flex min-w-0 items-center justify-between gap-3">
          <Button
            className="min-h-11 shrink-0"
            disabled={pending}
            onClick={onCancel}
            size="sm"
            type="button"
            variant="ghost"
          >
            {cancelLabel}
          </Button>
          {saveButton}
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3">
          {onBack ? (
            <Button
              className="min-h-11 justify-self-start"
              disabled={backDisabled}
              onClick={onBack}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ChevronLeft className="size-4" /> Previous
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
          {alternateSaveLabel ? <span aria-hidden="true" /> : saveButton}
          {onNext ? (
            <Button
              className="min-h-11 justify-self-end"
              disabled={nextDisabled}
              onClick={onNext}
              size="sm"
              type="button"
              variant="outline"
            >
              Next <ChevronRight className="size-4" />
            </Button>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
      )}
      {alternateSaveLabel ? (
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
          {saveButton}
          <Button
            className="min-h-11 min-w-0 whitespace-normal"
            data-planner-save-intent="save-and-create-another"
            disabled={pending || saveDisabled}
            type="submit"
            variant="outline"
          >
            {alternateSaveLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
