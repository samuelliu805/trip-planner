import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Shared action layout for stepped and single-page editor forms. */
export function PlannerEditorFormActions({
  alternateSaveLabel,
  backDisabled = false,
  onBack,
  onNext,
  nextDisabled = false,
  pending,
  pendingLabel,
  saveLabel = "Save",
}: {
  alternateSaveLabel?: string;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  onBack?: () => void;
  onNext?: () => void;
  pending: boolean;
  pendingLabel: string;
  saveLabel?: string;
}) {
  const saveButton = (
    <Button
      aria-busy={pending}
      className="min-h-11 min-w-0 font-semibold shadow-sm"
      disabled={pending}
      size="sm"
      type="submit"
    >
      {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
      {pending ? pendingLabel : saveLabel}
    </Button>
  );

  return (
    <div className="planner-item-form-actions mt-10 min-w-0 space-y-3 border-t pt-6">
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
      {alternateSaveLabel ? (
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3">
          {saveButton}
          <Button
            className="min-h-11 min-w-0 whitespace-normal"
            data-planner-save-intent="save-and-create-another"
            disabled={pending}
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
