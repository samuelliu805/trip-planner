"use client";

import { useEffect, useRef, type ReactNode } from "react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

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

export function PullUpPanelHandle({ onClose }: { onClose: () => void }) {
  const gesture = useRef<{ startedAt: number; startY: number } | undefined>(undefined);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const move = (clientY: number) => {
      const current = gesture.current;
      if (!current || clientY - current.startY < 72) return;
      gesture.current = undefined;
      onCloseRef.current();
    };
    const finish = (clientY: number) => {
      const current = gesture.current;
      gesture.current = undefined;
      if (!current) return;
      const distance = clientY - current.startY;
      const elapsed = Math.max(1, performance.now() - current.startedAt);
      if (distance >= 72 || (distance >= 36 && distance / elapsed >= 0.45)) {
        onCloseRef.current();
      }
    };
    const cancel = () => {
      gesture.current = undefined;
    };
    const pointerMove = (event: PointerEvent) => move(event.clientY);
    const pointerUp = (event: PointerEvent) => finish(event.clientY);
    const mouseMove = (event: MouseEvent) => move(event.clientY);
    const mouseUp = (event: MouseEvent) => finish(event.clientY);
    const touchMove = (event: TouchEvent) => move(event.touches[0]?.clientY ?? 0);
    const touchEnd = (event: TouchEvent) => finish(event.changedTouches[0]?.clientY ?? 0);

    window.addEventListener("pointermove", pointerMove);
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("mousemove", mouseMove);
    window.addEventListener("mouseup", mouseUp);
    window.addEventListener("touchmove", touchMove);
    window.addEventListener("touchend", touchEnd);
    window.addEventListener("touchcancel", cancel);
    return () => {
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("mouseup", mouseUp);
      window.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", cancel);
    };
  }, []);

  const startGesture = (clientY: number) => {
    gesture.current = { startedAt: performance.now(), startY: clientY };
  };

  return (
    <div
      aria-hidden="true"
      className="flex h-8 shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
      data-pull-up-handle=""
      onMouseDown={(event) => startGesture(event.clientY)}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        startGesture(event.clientY);
      }}
      onTouchStart={(event) => startGesture(event.touches[0]?.clientY ?? 0)}
    >
      <span className="h-1 w-10 rounded-full bg-muted-foreground/25" />
    </div>
  );
}

export function PullUpPanel({
  children,
  className,
  description,
  id,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  id: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  useExclusivePullUpPanel(id, open, onOpenChange);
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className={cn(
          "mobile-pull-up-panel max-h-[88dvh] rounded-t-2xl border-t bg-background pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        side="bottom"
      >
        <PullUpPanelHandle onClose={() => onOpenChange(false)} />
        <SheetHeader className="shrink-0 border-b-0 pb-3 pt-3">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
