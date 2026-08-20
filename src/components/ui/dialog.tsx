"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

type DialogViewport = {
  center: number;
  height: number;
  top: number;
};

type DialogViewportStyle = React.CSSProperties & {
  "--dialog-viewport-center"?: string;
  "--dialog-viewport-height"?: string;
  "--dialog-viewport-top"?: string;
};

function useDialogViewport() {
  const [viewport, setViewport] = React.useState<DialogViewport>();

  React.useEffect(() => {
    const visualViewport = window.visualViewport;
    let frame = 0;

    function measure() {
      const height = visualViewport?.height ?? window.innerHeight;
      const offsetTop = visualViewport?.offsetTop ?? 0;
      const next = { center: offsetTop + height / 2, height, top: offsetTop };
      setViewport((current) =>
        current?.center === next.center &&
        current.height === next.height &&
        current.top === next.top
          ? current
          : next,
      );
    }

    function scheduleMeasure() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    measure();
    window.addEventListener("resize", scheduleMeasure);
    visualViewport?.addEventListener("resize", scheduleMeasure);
    visualViewport?.addEventListener("scroll", scheduleMeasure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleMeasure);
      visualViewport?.removeEventListener("resize", scheduleMeasure);
      visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, []);

  return viewport;
}

function DialogContent({
  className,
  children,
  style,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  const viewport = useDialogViewport();
  const viewportStyle: DialogViewportStyle = {
    ...(viewport
      ? {
          "--dialog-viewport-center": `${viewport.center}px`,
          "--dialog-viewport-height": `${viewport.height}px`,
          "--dialog-viewport-top": `${viewport.top}px`,
        }
      : null),
    ...style,
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        data-dialog-overlay=""
      />
      <DialogPrimitive.Content
        className={cn(
          "app-dialog-content fixed inset-x-0 bottom-0 z-[110] max-h-[calc(var(--dialog-viewport-height,100svh)-max(8px,env(safe-area-inset-top))-max(8px,env(safe-area-inset-bottom)))] w-full min-w-0 max-w-full touch-pan-y overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-xl border bg-background shadow-xl data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[var(--dialog-viewport-center,50svh)] sm:w-[calc(100%-2rem)] sm:max-w-[500px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:zoom-in-95",
          className,
        )}
        style={viewportStyle}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="app-dialog-close absolute right-4 top-4 z-20 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-dialog-close=""
        >
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("space-y-1.5 border-b px-5 py-5 pr-16 sm:px-6", className)} {...props} />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 border-t bg-muted/40 px-5 py-4 sm:flex-row sm:justify-end sm:px-6",
        className,
      )}
      {...props}
    />
  );
}

const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
