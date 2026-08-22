"use client";

import { LoaderCircle } from "lucide-react";
import { useId, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * One field, docked clear of the software keyboard.
 *
 * It needs no keyboard arithmetic of its own: the surface spans the window, follows the page with
 * `--visual-viewport-top`, and holds `--keyboard-inset` of padding at the bottom, so the field
 * lands just above the keyboard and stays there even if iPadOS moves the page underneath. Guessing
 * the keyboard's height and lifting the bar was tried first and lost the race against focus.
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

  // The dock only ever renders from a tap, so this guard is for the render pass, not for hydration.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed left-0 right-0 z-[110] flex flex-col justify-end"
      style={{
        height: "var(--visual-viewport-height, 100dvh)",
        paddingBottom: "var(--keyboard-inset, 0px)",
        top: "var(--visual-viewport-top, 0px)",
      }}
    >
      <button
        aria-label="Cancel"
        className="min-h-0 flex-1 bg-black/20"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div className="border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(15_23_42/12%)]">
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
