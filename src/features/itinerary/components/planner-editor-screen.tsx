"use client";

import { useSyncExternalStore, type ReactNode, type Ref } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { usePlannerEditorViewportLock } from "@/features/itinerary/components/use-planner-editor-viewport-lock";

const desktopQuery = "(min-width: 1200px)";
const subscribeDesktop = (listener: () => void) => {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};

/** The one full-screen editor surface shared by itinerary cells and trip settings. */
export function PlannerEditorScreen({
  children,
  editorKind,
  initialFocusSelector,
  onDismissReason,
  onOpenChange,
  open,
  nonBlocking = false,
}: {
  children: ReactNode;
  editorKind?: "research" | "trip-people" | "trip-settings" | "variant";
  initialFocusSelector?: string;
  onDismissReason?: (reason: "escape" | "overlay") => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  nonBlocking?: boolean;
}) {
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
  const floating = nonBlocking && desktop;
  usePlannerEditorViewportLock(open && !floating);

  return (
    <Sheet modal={!floating} onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="planner-item-dialog p-0"
        data-editor-kind={editorKind}
        data-nonblocking={floating ? "" : undefined}
        onInteractOutside={(event) => {
          if (floating) event.preventDefault();
        }}
        onEscapeKeyDown={() => onDismissReason?.("escape")}
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
        onPointerDownOutside={() => onDismissReason?.("overlay")}
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
