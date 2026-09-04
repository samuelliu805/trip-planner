"use client";

import { useEffect, useRef, type ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Localized } from "@/features/i18n/i18n-provider";
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
}: {
  className?: string;
  onClose: () => void;
}) {
  const controllerRef = usePullUpPanelDrag(onClose);

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
}: {
  children: ReactNode;
  className?: string;
  compactHeader?: boolean;
  description?: string;
  dragMode?: "all" | "mobile";
  focusPanelOnOpen?: boolean;
  id: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  overlayClassName?: string;
  title: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useExclusivePullUpPanel(id, open, onOpenChange);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className={cn(
          "mobile-pull-up-panel max-h-[76dvh] rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)] [&>[data-sheet-close]]:top-8",
          compactHeader && "[&>[data-sheet-close]]:top-3",
          className,
        )}
        overlayClassName={overlayClassName}
        onOpenAutoFocus={(event) => {
          if (!focusPanelOnOpen) return;
          event.preventDefault();
          panelRef.current?.focus({ preventScroll: true });
        }}
        ref={panelRef}
        showCloseButton={false}
        side="bottom"
        tabIndex={focusPanelOnOpen ? -1 : undefined}
      >
        <PullUpPanelHandle
          className={cn(dragMode === "mobile" ? "sm:hidden" : undefined, compactHeader && "h-5")}
          onClose={() => onOpenChange(false)}
        />
        <SheetHeader className={cn("shrink-0 border-b-0 pb-3 pt-3", compactHeader && "pb-2 pt-1")}>
          <SheetTitle className={compactHeader ? "text-lg leading-tight" : undefined}>
            <Localized value={title} />
          </SheetTitle>
          {description ? (
            <SheetDescription>
              <Localized value={description} />
            </SheetDescription>
          ) : null}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
