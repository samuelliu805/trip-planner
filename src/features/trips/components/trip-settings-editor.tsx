"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  PlannerEditorPage,
  PlannerEditorScreen,
} from "@/features/itinerary/components/planner-editor-screen";
import { usePlannerEditorKeyboardScroll } from "@/features/itinerary/components/use-planner-editor-keyboard-scroll";

function TripSettingsHeader({
  description,
  onClose,
  title,
}: {
  description: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="planner-item-form-header shrink-0 border-b px-5 pb-4 pt-4 sm:px-6">
      <div className="planner-item-form-header-inner flex min-h-11 items-center gap-3">
        <div className="mr-auto min-w-0">
          <SheetTitle className="truncate text-xl font-extrabold tracking-tight">
            {title}
          </SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
        </div>
        <Button
          aria-label="Close editor"
          className="size-11 shrink-0 p-0"
          onClick={onClose}
          type="button"
          variant="ghost"
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </div>
    </div>
  );
}

function TripSettingsPage({
  children,
  description,
  onClose,
  title,
}: {
  children: ReactNode;
  description: string;
  onClose: () => void;
  title: string;
}) {
  const editorScrollRef = usePlannerEditorKeyboardScroll();

  return (
    <PlannerEditorPage
      header={<TripSettingsHeader description={description} onClose={onClose} title={title} />}
      scrollRef={editorScrollRef}
    >
      <div className="planner-item-form-content px-5 py-8 sm:px-6 sm:py-10">
        <div className="planner-item-form-card">{children}</div>
      </div>
    </PlannerEditorPage>
  );
}

/** Trip settings provide different fields inside the exact editor screen and page used by cells. */
export function TripSettingsEditor({
  children,
  description,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  return (
    <PlannerEditorScreen onOpenChange={onOpenChange} open={open}>
      <TripSettingsPage description={description} onClose={() => onOpenChange(false)} title={title}>
        {children}
      </TripSettingsPage>
    </PlannerEditorScreen>
  );
}
