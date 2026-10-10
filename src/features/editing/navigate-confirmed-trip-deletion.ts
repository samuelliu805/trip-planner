"use client";

import { isAccountActive } from "./account-runtime";
import type { BackgroundActionIntent } from "./background-action-intent";

/** Called only after the ACK checkpoint and its compacted receipt are durable. */
export function navigateConfirmedTripDeletion(
  scope: string[],
  intent: BackgroundActionIntent,
  result: unknown,
) {
  if (intent.kind !== "trip.delete" || !isAccountActive(scope[1])) return;
  const tripId = intent.input.tripId;
  const deletedId = (result as { data?: { deletedId?: unknown } } | null)?.data?.deletedId;
  if (
    deletedId === tripId &&
    window.location.pathname.startsWith("/trips/") &&
    window.location.pathname.split("/")[2] === tripId
  )
    window.location.assign("/trips");
}
