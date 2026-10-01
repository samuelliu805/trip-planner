"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Localized, T } from "@/features/i18n/i18n-provider";
import { useDialogViewport } from "./dialog";
import { cn } from "@/lib/utils";

import { usePullUpPanelDrag } from "./use-pull-up-panel-drag";

const PANEL_OPEN_EVENT = "trip-planner:pull-up-panel-open";

type PanelOpenDetail = { id: string };

export function useExclusivePullUpPanel(
  id: string,
  open: boolean,
  onOpenChange: (open: boolean) => void,
) {
  const onOpenChangeRef = useRef(onOpenChange);

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);

  useEffect(() => {
    const closeForAnotherPanel = (event: Event) => {
      const detail = (event as CustomEvent<PanelOpenDetail>).detail;
      if (detail?.id !== id) onOpenChangeRef.current(false);
    };
    window.addEventListener(PANEL_OPEN_EVENT, closeForAnotherPanel);
    return () => window.removeEventListener(PANEL_OPEN_EVENT, closeForAnotherPanel);
  }, [id]);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent<PanelOpenDetail>(PANEL_OPEN_EVENT, { detail: { id } }));
  }, [id, open]);
}

export function PullUpPanelHandle({
  className,
  onClose,
  handleOnly = false,
}: {
  className?: string;
  onClose: () => void;
  handleOnly?: boolean;
}) {
  const controllerRef = usePullUpPanelDrag(onClose, handleOnly);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-8 shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing",
        className,
      )}
      data-pull-up-handle=""
      ref={controllerRef}
    >
      <span className="h-1 w-10 rounded-full bg-muted-foreground/25" />
    </div>
  );
}

export function PullUpPanel({
  children,
  className,
  compactHeader = false,
  description,
  dragMode = "all",
  focusPanelOnOpen = false,
  id,
  onOpenChange,
  open,
  overlayClassName,
  title,
  trigger,
}: {
  children: ReactNode;
  className?: string;
  compactHeader?: boolean;
  description?: string;
  dragMode?: "all" | "mobile" | "handle";
  focusPanelOnOpen?: boolean;
  id: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  overlayClassName?: string;
  title: string;
  trigger?: HTMLElement | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const viewport = useDialogViewport(open);
  useExclusivePullUpPanel(id, open, onOpenChange);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "mobile-pull-up-panel max-h-[76dvh] rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)] font-sans sm:rounded-xl sm:max-h-[min(76dvh,calc(var(--dialog-viewport-height,100svh)-2rem))]",
          className,
        )}
        overlayClassName={overlayClassName}
        onOpenAutoFocus={(event) => {
          if (!focusPanelOnOpen) return;
          event.preventDefault();
          panelRef.current?.focus({ preventScroll: true });
        }}
        ref={panelRef}
        style={
          viewport
            ? ({
                "--dialog-viewport-center": `${viewport.center}px`,
                "--dialog-viewport-height": `${viewport.height}px`,
              } as React.CSSProperties)
            : undefined
        }
        onCloseAutoFocus={(event) => {
          if (!trigger?.isConnected) return;
          event.preventDefault();
          trigger.focus({ preventScroll: true });
        }}
        showCloseButton={false}
        side="adaptive"
        tabIndex={focusPanelOnOpen ? -1 : undefined}
      >
        <PullUpPanelHandle
          handleOnly={dragMode === "handle"}
          className={cn("sm:hidden", compactHeader && "h-5")}
          onClose={() => onOpenChange(false)}
        />
        <SheetHeader className="shrink-0 border-b-0 px-5 pb-3 pt-1 sm:pt-4" data-panel-header="">
          <div className="flex min-h-11 items-center gap-4">
            <SheetTitle className="min-w-0 flex-1 break-words text-lg font-bold leading-snug">
              <Localized value={title} />
            </SheetTitle>
            <SheetClose
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-sheet-close=""
            >
              <X aria-hidden="true" className="size-5" />
              <span className="sr-only">
                <T message="Close" />
              </span>
            </SheetClose>
          </div>
          {description ? (
            <SheetDescription id={descriptionId}>
              <Localized value={description} />
            </SheetDescription>
          ) : null}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
