"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
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
  const { t } = useI18n();
  const createAnother = intent === "save-and-create-another";
  const localizedLabel = t(itemLabel);

  return (
    <AlertDialog onOpenChange={onOpenChange} open={Boolean(intent)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {createAnother
              ? t("Create this {item} and start another?", { item: localizedLabel })
              : t("Create this {item}?", { item: localizedLabel })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {createAnother
              ? t(
                  "“{title}” will be added to the itinerary. The success message will include a link back to it while you start the next {item}.",
                  { item: localizedLabel, title: itemTitle },
                )
              : t("“{title}” will be added to the itinerary.", { title: itemTitle })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <T message={"Keep editing"} />
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onConfirm}
            type="button"
          >
            <CircleCheck aria-hidden="true" className="size-4" />
            {createAnother
              ? t("Create & start another")
              : t("Create {item}", { item: localizedLabel })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
