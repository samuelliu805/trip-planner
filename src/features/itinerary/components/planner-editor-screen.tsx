"use client";

import type { ReactNode, Ref } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePlannerEditorViewportLock } from "@/features/itinerary/components/use-planner-editor-viewport-lock";

/** The one full-screen editor surface shared by itinerary cells and trip settings. */
export function PlannerEditorScreen({
  children,
  itemViewportMatchesProduction = false,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  itemViewportMatchesProduction?: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  usePlannerEditorViewportLock(open);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className={
          itemViewportMatchesProduction
            ? "planner-item-dialog planner-item-dialog-production-item p-0"
            : "planner-item-dialog p-0"
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

/** One editor page that can reproduce the production item scroller or pin a simple header. */
export function PlannerEditorPage({
  children,
  header,
  headerScrolls = false,
  scrollRef,
}: {
  children: ReactNode;
  header: ReactNode;
  headerScrolls?: boolean;
  scrollRef?: Ref<HTMLDivElement>;
}) {
  const scrollingContent = (
    <div
      className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain"
      data-planner-editor-scroll=""
      ref={scrollRef}
    >
      {headerScrolls ? header : null}
      {children}
    </div>
  );

  if (headerScrolls) return scrollingContent;

  return (
    <>
      {header}
      {scrollingContent}
    </>
  );
}
