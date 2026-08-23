"use client";

import { Pencil, Plus } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";

import { ResearchItemForm } from "./research-item-form";
import { researchCategorySingularLabels, type ResearchCategory, type ResearchItem } from "../types";

export function ResearchItemDialog({
  category,
  context,
  defaultCurrency,
  item,
  onSaved,
  tripId,
}: {
  category: ResearchCategory;
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  item?: ResearchItem;
  onSaved: (item: ResearchItem) => void;
  tripId: string;
}) {
  const [open, setOpen] = useState(false);
  const closeRequest = useRef(() => setOpen(false));
  const label = researchCategorySingularLabels[category];

  return (
    <>
      {item ? (
        <Button
          aria-label={`Edit ${item.title ?? label}`}
          className="size-11 p-0 xl:size-9"
          onClick={() => setOpen(true)}
          size="sm"
          variant="ghost"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
      ) : (
        <Button
          aria-label={`Add ${label.toLowerCase()} price or idea`}
          className="size-11 shrink-0 p-0 sm:h-11 sm:w-auto sm:px-4"
          onClick={() => setOpen(true)}
          title={`Add ${label.toLowerCase()} price or idea`}
        >
          <Plus aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Add price or idea</span>
        </Button>
      )}
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
