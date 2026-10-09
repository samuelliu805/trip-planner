"use client";

import { useEffect } from "react";

import { GuestDraftStorage } from "../storage";

/** Login alone is not evidence that the only Guest copy was imported successfully. */
export function AuthenticatedGuestStorageCleanup() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("post_login") === "1") return;
    for (const region of ["global", "cn"] as const) {
      try {
        new GuestDraftStorage(region, window.localStorage).clearConfirmedImport();
      } catch {
        /* A blocked storage API must not prevent authenticated navigation. */
      }
    }
  }, []);

  return null;
}
