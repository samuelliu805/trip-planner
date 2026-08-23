"use client";

import { CircleCheck } from "lucide-react";

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
import type { PlannerEditorSaveIntent } from "@/features/itinerary/components/planner-editor-form";

export function PlannerItemSaveConfirmation({
  intent,
  itemLabel,
  itemTitle,
  onConfirm,
  onOpenChange,
}: {
  intent: PlannerEditorSaveIntent | null;
  itemLabel: string;
  itemTitle: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const createAnother = intent === "save-and-create-another";
  const lowerLabel = itemLabel.toLowerCase();

  return (
    <AlertDialog onOpenChange={onOpenChange} open={Boolean(intent)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {createAnother
              ? `Create this ${lowerLabel} and start another?`
              : `Create this ${lowerLabel}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {createAnother
              ? `“${itemTitle}” will be added to the itinerary. The success message will include a link back to it while you start the next ${lowerLabel}.`
              : `“${itemTitle}” will be added to the itinerary.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onConfirm}
            type="button"
          >
            <CircleCheck aria-hidden="true" className="size-4" />
            {createAnother ? "Create & start another" : `Create ${lowerLabel}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
