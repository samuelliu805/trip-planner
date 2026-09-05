"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";

import { T } from "@/features/i18n/i18n-provider";
import { GuestDraftStorage } from "@/features/guest/storage";
import type { GuestRegion } from "@/features/guest/schema";

/** Converts an App Router action redirect into one clean document navigation after sign-in. */
export function PostLoginRefresh({ region }: { region: GuestRegion }) {
  useEffect(() => {
    try {
      const storage = new GuestDraftStorage(region, window.localStorage);
      const draft = storage.load();
      const intent = storage.readIntent();
      if (draft) {
        window.location.replace(
          intent?.draftId === draft.draftId ? "/guest?claim=1" : "/guest?claim=prompt",
        );
        return;
      }
    } catch {
      /* Authentication still succeeds when browser storage is unavailable. */
    }
    window.location.replace("/trips");
  }, [region]);

  return (
    <main className="grid min-h-[calc(100dvh-4rem)] place-items-center" role="status">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        <T message="Loading…" />
      </span>
    </main>
  );
}
