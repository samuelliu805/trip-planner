import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PlannerEditorFormActions({
  backDisabled = false,
  onBack,
  onNext,
  nextDisabled = false,
  pending,
  pendingLabel,
}: {
  backDisabled?: boolean;
  nextDisabled?: boolean;
  onBack?: () => void;
  onNext?: () => void;
  pending: boolean;
  pendingLabel: string;
}) {
  return (
    <div className="planner-item-form-actions mt-10 grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-t pt-6">
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
      <Button
        aria-busy={pending}
        className="min-h-11 min-w-28 font-semibold shadow-sm"
        disabled={pending}
        size="sm"
        type="submit"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {pending ? pendingLabel : "Save"}
      </Button>
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
  );
}
