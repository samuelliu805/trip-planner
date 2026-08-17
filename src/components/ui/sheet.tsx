"use client";

import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

type SheetViewportStyle = React.CSSProperties & {
  "--sheet-viewport-height"?: string;
  "--sheet-viewport-top"?: string;
};

function useSheetViewport() {
  const [viewport, setViewport] = React.useState<{
    height: number;
    top: number;
  }>();

  React.useEffect(() => {
    const visualViewport = window.visualViewport;
    let frame = 0;
    function measure() {
      const height = visualViewport?.height ?? window.innerHeight;
      const top = visualViewport?.offsetTop ?? 0;
      const next = { height, top };
      setViewport((current) =>
        current?.height === height && current.top === top ? current : next,
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

function SheetContent({
  className,
  children,
  side = "right",
  style,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "right" | "bottom" }) {
  const viewport = useSheetViewport();
  const viewportStyle: SheetViewportStyle = {
    ...(viewport
      ? {
          "--sheet-viewport-height": `${viewport.height}px`,
          "--sheet-viewport-top": `${viewport.top}px`,
        }
      : null),
    ...style,
  };
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/35 data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none" />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-[110] flex min-w-0 max-w-full touch-pan-y flex-col overflow-x-hidden overscroll-contain border bg-background shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-md border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
            : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-xl border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
          className,
        )}
        style={viewportStyle}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute right-3 top-3 z-20 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-b px-5 py-5 pr-14", className)} {...props} />;
}
function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return <SheetPrimitive.Title className={cn("font-semibold", className)} {...props} />;
}
function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn("mt-1 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger };
