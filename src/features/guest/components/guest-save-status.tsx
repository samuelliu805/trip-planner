"use client";

import { AlertTriangle, Check, CloudOff, LoaderCircle } from "lucide-react";

import { T } from "@/features/i18n/i18n-provider";

import type { GuestSaveState } from "../use-guest-draft";

export function GuestSaveStatus({ state }: { state: GuestSaveState }) {
  const problem = ["conflict", "error", "unavailable"].includes(state.code);
  const Icon =
    state.code === "saving" || state.code === "loading"
      ? LoaderCircle
      : state.code === "saved"
        ? Check
        : state.code === "unavailable"
          ? CloudOff
          : problem
            ? AlertTriangle
            : Check;
  const label =
    state.code === "loading"
      ? "Loading local draft…"
      : state.code === "saving"
        ? "Saving locally…"
        : state.code === "saved"
          ? "Saved only in this browser"
          : state.code === "dirty"
            ? "Unsaved local changes"
            : state.code === "conflict"
              ? "Local save conflict"
              : "Not saved";
  const description =
    state.message ??
    (state.code === "saved"
      ? "This trip is only in this browser. Clearing browser data will delete it."
      : undefined);
  return (
    <span
      aria-live="polite"
      className={
        problem
          ? "flex items-center gap-1.5 text-xs font-semibold text-destructive"
          : "flex items-center gap-1.5 text-xs text-muted-foreground"
      }
      data-guest-save-state={state.code}
      data-i18n-title={description}
      role="status"
      title={description}
    >
      <Icon
        aria-hidden="true"
        className={`size-3.5 ${state.code === "saving" ? "animate-spin" : ""}`}
      />
      <T message={label} />
    </span>
  );
}
