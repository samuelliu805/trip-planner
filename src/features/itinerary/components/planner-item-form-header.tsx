"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ItemFormStep } from "@/features/itinerary/components/planner-item-form-steps";
import { PlannerItemStepNav } from "@/features/itinerary/components/planner-item-step-nav";

export function PlannerItemFormHeader({
  activeStep,
  closeDisabled,
  editing,
  error,
  label,
  onClose,
  onStepSelect,
  stepIndex,
  steps,
}: {
  activeStep: ItemFormStep;
  closeDisabled: boolean;
  editing: boolean;
  error?: string;
  label: string;
  onClose: () => void;
  onStepSelect: (stepId: ItemFormStep["id"]) => void;
  stepIndex: number;
  steps: ItemFormStep[];
}) {
  return (
    <div className="planner-item-form-header border-b px-5 pb-5 pt-4 sm:px-6">
      <div className="planner-item-form-header-inner space-y-4">
        <div className="flex min-h-11 flex-wrap items-center gap-3">
          <DialogTitle className="mr-auto min-w-0 truncate text-xl font-extrabold tracking-tight">
            {editing ? "Edit" : "Add"} {label.toLowerCase()}
          </DialogTitle>
          <Button
            aria-label="Close editor"
            className="size-11 shrink-0 p-0"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-5" />
          </Button>
        </div>
        <DialogDescription className="sr-only">
          Step {stepIndex + 1} of {steps.length}: {activeStep.title}. The item can be saved from any
          step.
        </DialogDescription>
        <PlannerItemStepNav activeStepId={activeStep.id} onSelect={onStepSelect} steps={steps} />
        {error ? (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
