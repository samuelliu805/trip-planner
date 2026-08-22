"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** What the keyboard is assumed to cover until it reports its real height. Never assume less. */
const assumedKeyboardRatio = 0.55;

/** How much of the layout viewport sits outside what the user can see — the keyboard, in practice. */
function keyboardInset() {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

/**
 * One field, docked above the software keyboard the way a chat composer is.
 *
 * iPadOS reveals a focused field the keyboard would cover by moving the whole page inside the
 * layout viewport, and the offset it leaves behind reports `scrollY` as 0 — nothing can scroll it
 * back, and the next screen inherits it. A field that is never covered gives it nothing to reveal.
 * So this lifts itself clear of the keyboard *before* the input takes focus, then tracks
 * VisualViewport for the real height. Overshooting the lift is harmless; falling short is not.
 */
export function DockedFieldEditor({
  busy = false,
  error,
  label,
  maxLength,
  onCancel,
  onSubmit,
  saveLabel = "Save",
  value,
}: {
  busy?: boolean;
  error?: string;
  label: string;
  maxLength?: number;
  onCancel: () => void;
  onSubmit: (next: string) => void;
  saveLabel?: string;
  value: string;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState(value);
  const [lift, setLift] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const track = () => setLift(keyboardInset());
    viewport.addEventListener("resize", track);
    viewport.addEventListener("scroll", track);
    return () => {
      viewport.removeEventListener("resize", track);
      viewport.removeEventListener("scroll", track);
    };
  }, []);

  /**
   * Pointer down runs before focus, which is the last moment the page can be kept still. iPadOS
   * blocks programmatic focus outside a gesture anyway, so the traveller's own tap is what opens
   * the keyboard — and this rides ahead of it.
   */
  const liftBeforeFocus = useCallback(() => {
    setLift((current) => Math.max(current, Math.round(window.innerHeight * assumedKeyboardRatio)));
  }, []);

  // The dock only ever renders from a tap, so this guard is for the render pass, not for hydration.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex flex-col justify-end">
      <button
        aria-label="Cancel"
        className="min-h-0 flex-1 bg-black/20"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div
        className="border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(15_23_42/12%)] transition-transform duration-150 motion-reduce:transition-none"
        style={{ transform: `translateY(-${lift}px)` }}
      >
        <form
          className="mx-auto min-w-0 max-w-[52rem]"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            onCancel();
          }}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(draft);
          }}
        >
          <label
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            htmlFor={fieldId}
          >
            {label}
          </label>
          <div className="mt-1.5 flex min-w-0 items-center gap-2">
            <Input
              autoComplete="off"
              className="min-h-12 min-w-0 flex-1 text-base"
              id={fieldId}
              maxLength={maxLength}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onPointerDown={liftBeforeFocus}
              value={draft}
            />
            <Button className="min-h-12 shrink-0" disabled={busy || !draft.trim()} type="submit">
              {busy ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : null}
              {saveLabel}
            </Button>
            <Button
              className="min-h-12 shrink-0"
              disabled={busy}
              onClick={onCancel}
              type="button"
              variant="ghost"
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <p className="mt-2 text-sm font-medium text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </div>,
    document.body,
  );
}
