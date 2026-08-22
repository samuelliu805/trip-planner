"use client";

import { useCallback, type ReactNode } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePlannerEditorKeyboardScroll } from "@/features/itinerary/components/use-planner-editor-keyboard-scroll";
import { usePlannerEditorViewportLock } from "@/features/itinerary/components/use-planner-editor-viewport-lock";

/** The one full-screen editor surface shared by itinerary cells and trip settings. */
export function PlannerEditorScreen({
  children,
  onOpenChange,
  open,
}: {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  usePlannerEditorViewportLock(open);

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="planner-item-dialog p-0"
        overlayClassName="bg-background"
        showCloseButton={false}
        side="right"
      >
        {open ? children : null}
      </SheetContent>
    </Sheet>
  );
}

/** The shared fixed-header, single-scroller page inside every planner editor. */
export function PlannerEditorPage({
  children,
  header,
  onScrollNode,
}: {
  children: ReactNode;
  header: ReactNode;
  onScrollNode?: (node: HTMLDivElement | null) => void;
}) {
  const editorScrollRef = usePlannerEditorKeyboardScroll();
  const setEditorScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      editorScrollRef.current = node;
      onScrollNode?.(node);
    },
    [editorScrollRef, onScrollNode],
  );

  return (
    <>
      {header}
      <div
        className="min-h-0 min-w-0 flex-1 touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain"
        data-planner-editor-scroll=""
        ref={setEditorScrollNode}
      >
        {children}
      </div>
    </>
  );
}
