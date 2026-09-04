"use client";

import { X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { useAutoDismiss } from "./use-auto-dismiss";

export function AutoDismissAlert({
  children,
  className,
  delayMilliseconds = 6_000,
  onDismiss,
  role = "status",
  tone = "default",
  value,
}: {
  children: ReactNode;
  className?: string;
  delayMilliseconds?: number;
  onDismiss?: () => void;
  role?: "alert" | "status";
  tone?: "default" | "destructive" | "success";
  value: unknown;
}) {
  const [display, setDisplay] = useState(() => ({ dismissed: false, revision: 0, value }));
  if (!Object.is(display.value, value)) {
    setDisplay({ dismissed: false, revision: display.revision + 1, value });
  }
  const visible = Boolean(value) && !display.dismissed;
  const dismiss = () => {
    setDisplay({ dismissed: true, revision: display.revision, value });
    onDismiss?.();
  };
  useAutoDismiss(visible && value, dismiss, delayMilliseconds);
  if (!value || !visible) return null;

  return (
    <div
      aria-live={role === "alert" ? "assertive" : "polite"}
      className={cn(
        "relative flex min-w-0 items-center gap-3 overflow-hidden border bg-background px-4 py-2 text-sm shadow-lg",
        tone === "destructive" && "border-destructive/40 text-destructive",
        tone === "success" && "border-primary/40",
        className,
      )}
      role={role}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <button
        aria-label="Dismiss message"
        className="-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-i18n-aria-label="Dismiss message"
        onClick={dismiss}
        type="button"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
      <span
        aria-hidden="true"
        className={cn(
          "alert-countdown-progress absolute inset-x-0 bottom-0 h-1 origin-left bg-foreground/35",
          tone === "destructive" && "bg-destructive",
          tone === "success" && "bg-primary",
        )}
        key={display.revision}
        style={{ animationDuration: `${delayMilliseconds}ms` }}
      />
    </div>
  );
}
