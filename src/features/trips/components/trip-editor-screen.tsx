"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { usePlannerEditorKeyboardScroll } from "@/features/itinerary/components/use-planner-editor-keyboard-scroll";
import { usePlannerEditorViewportLock } from "@/features/itinerary/components/use-planner-editor-viewport-lock";

function TripEditorBody({
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
  // Mounting this hook with the portalled body guarantees the scroll surface already exists.
  const editorScrollRef = usePlannerEditorKeyboardScroll();

  return (
    <div
      className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain"
      data-planner-editor-scroll=""
      ref={editorScrollRef}
    >
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
      <div className="planner-item-form-content px-5 py-8 sm:px-6 sm:py-10">
        <div className="planner-item-form-card">{children}</div>
      </div>
    </div>
  );
}

/** Trip settings reuse the itinerary editor's one-scroller shell inside the planner. */
export function TripEditorScreen({
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
  usePlannerEditorViewportLock(open);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="planner-item-dialog trip-editor-dialog p-0"
        overlayClassName="bg-background"
        showCloseButton={false}
        side="right"
      >
        {open ? (
          <TripEditorBody
            description={description}
            onClose={() => onOpenChange(false)}
            title={title}
          >
            {children}
          </TripEditorBody>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
