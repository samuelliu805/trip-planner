import { Localized, T } from "@/features/i18n/i18n-provider";
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
      <Localized value={pending ? pendingLabel : saveLabel} />
    </Button>
  );
  const splitCancelAndSave = Boolean(onCancel && !onBack && !onNext && !alternateSaveLabel);
  const backButton = onBack ? (
    <Button
      aria-label="Previous step"
      data-i18n-aria-label={"Previous step"}
      className="size-11 shrink-0 gap-0 p-0 sm:w-auto sm:gap-2 sm:px-3"
      disabled={backDisabled}
      onClick={onBack}
      size="sm"
      type="button"
      variant="ghost"
    >
      <ChevronLeft className="size-4" />
      <span className="hidden sm:inline">
        <T message={"Previous"} />
      </span>
    </Button>
  ) : (
    <span aria-hidden="true" className="block size-11" />
  );
  const nextButton = onNext ? (
    <Button
      aria-label="Next step"
      data-i18n-aria-label={"Next step"}
      className="size-11 shrink-0 gap-0 p-0 sm:w-auto sm:gap-2 sm:px-3"
      disabled={nextDisabled}
      onClick={onNext}
      size="sm"
      type="button"
      variant="outline"
    >
      <span className="hidden sm:inline">
        <T message={"Next"} />
      </span>
      <ChevronRight className="size-4" />
    </Button>
  ) : (
    <span aria-hidden="true" className="block size-11" />
  );

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
            <Localized value={cancelLabel} />
          </Button>
          {saveButton}
        </div>
      ) : alternateSaveLabel ? (
        <div className="grid min-w-0 grid-cols-2 items-center gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-3">
          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:col-span-3 sm:row-start-2 sm:gap-3">
            {saveButton}
            <Button
              className="min-h-11 min-w-0 whitespace-normal"
              data-planner-save-intent="save-and-create-another"
              disabled={pending || saveDisabled}
              type="submit"
              variant="outline"
            >
              <span className="sm:hidden">
                <T message={"Save + another"} />
              </span>
              <span className="hidden sm:inline">
                <Localized value={alternateSaveLabel} />
              </span>
            </Button>
          </div>
          <div className="col-start-1 row-start-2 justify-self-start sm:row-start-1">
            {backButton}
          </div>
          <div className="col-start-2 row-start-2 justify-self-end sm:col-start-3 sm:row-start-1">
            {nextButton}
          </div>
        </div>
      ) : (
        <div className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="justify-self-start">{backButton}</div>
          {saveButton}
          <div className="justify-self-end">{nextButton}</div>
        </div>
      )}
    </div>
  );
}
