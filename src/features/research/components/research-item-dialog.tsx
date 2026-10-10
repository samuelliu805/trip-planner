"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { Pencil, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";

import { ResearchItemForm } from "./research-item-form";
import type { CreateResearchItemInput } from "../schema";
import { researchCategorySingularLabels, type ResearchCategory, type ResearchItem } from "../types";
import type { ResearchMutationResult } from "../types";

export function ResearchItemDialog({
  category,
  context,
  defaultCurrency,
  item,
  localSave,
  hideTrigger = false,
  onOpenChange,
  onSaved,
  open: controlledOpen,
  tripId,
}: {
  category: ResearchCategory;
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  item?: ResearchItem;
  localSave?: (
    input: CreateResearchItemInput,
    existingId?: string,
  ) => Promise<ResearchMutationResult<ResearchItem>>;
  hideTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: (item: ResearchItem) => void;
  open?: boolean;
  tripId: string;
}) {
  const { t } = useI18n();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  function setOpen(next: boolean) {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }
  const closeRequest = useRef(() => setOpen(false));
  const label = researchCategorySingularLabels[category];
  const addLabel =
    category === "activity" ? t("Add activity") : t("Add {item} price or idea", { item: t(label) });

  return (
    <>
      {!hideTrigger && item ? (
        <Button
          aria-label={t("Edit {item}", { item: item.title ?? t(label) })}
          className="size-11 p-0 xl:size-9"
          onClick={() => setOpen(true)}
          size="sm"
          variant="outline"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
      ) : !hideTrigger ? (
        <Button
          aria-label={addLabel}
          className="size-11 shrink-0 p-0 sm:h-11 sm:w-auto sm:px-4"
          onClick={() => setOpen(true)}
          title={addLabel}
        >
          <Plus aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">
            {category === "activity" ? (
              <T message="Add activity" />
            ) : (
              <T message="Add price or idea" />
            )}
          </span>
        </Button>
      ) : null}
      <PlannerEditorScreen
        editorKind="research"
        onOpenChange={(nextOpen) => !nextOpen && closeRequest.current()}
        open={open}
      >
        <ResearchItemForm
          category={category}
          context={context}
          defaultCurrency={defaultCurrency}
          item={item}
          localSave={localSave}
          key={`${category}:${item?.id ?? "new"}`}
          onCancel={() => setOpen(false)}
          onCloseRequestRegistration={(handler) => {
            closeRequest.current = handler ?? (() => setOpen(false));
          }}
          onSaved={onSaved}
          tripId={tripId}
        />
      </PlannerEditorScreen>
    </>
  );
}
