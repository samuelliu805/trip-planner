"use client";

import type { ReactNode, Ref } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePlannerEditorViewportLock } from "@/features/itinerary/components/use-planner-editor-viewport-lock";

/** The one full-screen editor surface shared by itinerary cells and trip settings. */
export function PlannerEditorScreen({
  children,
  initialFocusSelector,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  initialFocusSelector?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  usePlannerEditorViewportLock(open);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="planner-item-dialog p-0"
        onOpenAutoFocus={
          initialFocusSelector
            ? (event) => {
                event.preventDefault();
                (event.currentTarget as HTMLElement)
                  .querySelector<HTMLElement>(initialFocusSelector)
                  ?.focus({ preventScroll: true });
              }
            : undefined
        }
        overlayClassName="bg-background"
        showCloseButton={false}
        side="right"
      >
        {open ? children : null}
      </SheetContent>
    </Sheet>
  );
}

/** The shared production-style page: its header and fields use one scrolling surface. */
export function PlannerEditorPage({
  children,
  header,
  scrollRef,
}: {
  children: ReactNode;
  header: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto"
      data-planner-editor-scroll=""
      ref={scrollRef}
    >
      {header}
      {children}
    </div>
  );
}
