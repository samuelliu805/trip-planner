"use server";

import { revalidatePath } from "next/cache";

import { getRequestLocale } from "@/features/i18n/server";
import { safeMutationErrorCode } from "@/lib/telemetry/errors";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";
import { getServerProviderConfig } from "@/platform/config/server";
import type { Json } from "@/types/database";

import { guestTripDraftSchema, type GuestTripDraft } from "./schema";

export type ClaimGuestTripResult =
  { data: { tripId: string }; error?: never } | { data?: never; error: string };

export async function claimGuestTrip(draft: GuestTripDraft): Promise<ClaimGuestTripResult> {
  const parsed = guestTripDraftSchema.safeParse(draft);
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: "Sign in to save this local trip to an account." };
  if (!parsed.success) {
    await captureServerProductEvent(
      "guest_trip_import_failed",
      { error_code: "invalid_input", surface: "guest_trip" },
      { actorType: "authenticated", appUserId: user.id, route: "/guest" },
    );
    return { error: "The local trip is invalid and was not imported." };
  }
  if (parsed.data.region !== getServerProviderConfig().appRegion)
    return { error: "This local trip belongs to a different deployment region." };

  await captureServerProductEvent(
    "guest_trip_import_started",
    { surface: "guest_trip" },
    { actorType: "authenticated", appUserId: user.id, route: "/guest" },
  );
  try {
    const locale = await getRequestLocale();
    const trip = await getTripRepository().importGuestDraft({
      draftId: parsed.data.draftId,
      locale,
      payload: parsed.data as unknown as Json,
    });
    await captureServerProductEvent(
      "guest_trip_import_succeeded",
      { surface: "guest_trip" },
      { actorType: "authenticated", appUserId: user.id, route: "/guest" },
    );
    revalidatePath("/trips");
    revalidatePath(`/trips/${trip.id}`);
    return { data: { tripId: trip.id } };
  } catch (error) {
    await captureServerProductEvent(
      "guest_trip_import_failed",
      { error_code: safeMutationErrorCode(error), surface: "guest_trip" },
      { actorType: "authenticated", appUserId: user.id, route: "/guest" },
    );
    return {
      error: error instanceof Error ? error.message : "The local trip could not be imported.",
    };
  }
}
