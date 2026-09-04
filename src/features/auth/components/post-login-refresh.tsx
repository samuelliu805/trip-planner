"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";

import { T } from "@/features/i18n/i18n-provider";

/** Converts an App Router action redirect into one clean document navigation after sign-in. */
export function PostLoginRefresh() {
  useEffect(() => {
    window.location.replace("/trips");
  }, []);

  return (
    <main className="grid min-h-[calc(100dvh-4rem)] place-items-center" role="status">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        <T message="Loading…" />
      </span>
    </main>
  );
}
