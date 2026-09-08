"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import { claimGuestTrip } from "@/features/guest/actions";
import { GuestDraftStorage } from "@/features/guest/storage";
import type { GuestRegion } from "@/features/guest/schema";

/** Converts an App Router action redirect into one clean document navigation after sign-in. */
export function PostLoginRefresh({ region }: { region: GuestRegion }) {
  const started = useRef(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      try {
        const storage = new GuestDraftStorage(region, window.localStorage);
        const draft = storage.load();
        const intent = storage.readIntent();
        if (draft) {
          const result = await claimGuestTrip(draft);
          if (!result.data) {
            for (const targetRegion of ["global", "cn"] as const)
              new GuestDraftStorage(targetRegion, window.localStorage).clearAll();
            setError(result.error ?? "The local trip could not be imported.");
            return;
          }
          for (const targetRegion of ["global", "cn"] as const)
            new GuestDraftStorage(targetRegion, window.localStorage).clearAll();
          const destination =
            intent?.draftId === draft.draftId && intent.action === "share"
              ? `/trips/${result.data.tripId}?share=1`
              : intent?.draftId === draft.draftId && intent.action === "attachment" && intent.itemId
                ? `/trips/${result.data.tripId}?item=${intent.itemId}`
                : `/trips/${result.data.tripId}`;
          window.location.replace(destination);
          return;
        }
        for (const targetRegion of ["global", "cn"] as const)
          new GuestDraftStorage(targetRegion, window.localStorage).clearAll();
      } catch {
        for (const targetRegion of ["global", "cn"] as const) {
          try {
            new GuestDraftStorage(targetRegion, window.localStorage).clearAll();
          } catch {
            /* Authentication succeeds even when browser storage is unavailable. */
          }
        }
      }
      window.location.replace("/trips");
    })();
  }, [region]);

  return (
    <main className="grid min-h-[calc(100dvh-4rem)] place-items-center" role="status">
      {error ? (
        <div className="max-w-md space-y-4 px-5 text-center">
          <p className="text-sm font-medium text-destructive" role="alert">
            <T message={error} />
          </p>
          <Button
            onClick={() => {
              for (const targetRegion of ["global", "cn"] as const) {
                try {
                  new GuestDraftStorage(targetRegion, window.localStorage).clearAll();
                } catch {
                  /* Continue to the authenticated workspace. */
                }
              }
              window.location.replace("/trips");
            }}
            type="button"
          >
            <T message="Continue to trips" />
          </Button>
        </div>
      ) : (
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          <T message="Loading…" />
        </span>
      )}
    </main>
  );
}
