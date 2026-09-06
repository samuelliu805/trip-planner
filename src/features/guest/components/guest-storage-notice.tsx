"use client";

import { Button } from "@/components/ui/button";
import { Localized, T } from "@/features/i18n/i18n-provider";

import type { GuestSaveState } from "../use-guest-draft";

export function GuestStorageNotice({
  authenticated,
  onCopy,
  onReset,
  onRetry,
  onSignIn,
  state,
}: {
  authenticated: boolean;
  onCopy: () => void;
  onReset: () => void;
  onRetry: () => void;
  onSignIn: () => void;
  state: GuestSaveState;
}) {
  if (!["conflict", "error", "unavailable"].includes(state.code)) return null;
  return (
    <aside
      className="fixed inset-x-3 bottom-3 z-[90] mx-auto max-w-2xl rounded-xl border border-destructive/30 bg-background p-4 shadow-xl"
      role="alert"
    >
      <p className="text-sm font-bold">
        <T
          message={
            state.code === "conflict"
              ? "This draft changed in another tab."
              : "This plan is not being saved."
          }
        />
      </p>
      <p className="mt-1 text-sm leading-5 text-muted-foreground">
        <T
          message={
            authenticated
              ? "This browser cannot save your local plan. Save it to your account before leaving."
              : "This browser cannot save your local plan. Sign in before leaving to create a cloud trip."
          }
        />
      </p>
      {state.message ? (
        <p className="mt-1 break-words text-xs text-destructive">
          <Localized value={state.message} />
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="min-h-11" onClick={onSignIn} size="sm">
          <T message={"Save to account"} />
        </Button>
        <Button className="min-h-11" onClick={onRetry} size="sm" variant="outline">
          <T message={"Retry local save"} />
        </Button>
        <Button className="min-h-11" onClick={onCopy} size="sm" variant="outline">
          <T message={"Copy recovery data"} />
        </Button>
        {state.code === "conflict" || state.raw ? (
          <Button className="min-h-11" onClick={onReset} size="sm" variant="ghost">
            <T message={"Start a new local draft"} />
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
