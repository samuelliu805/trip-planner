"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { getRequestLocale } from "@/features/i18n/server";
import { listPublicItineraryLinks } from "@/features/sharing/data";
import {
  defaultTripCurrencyForRegion,
  defaultTripDayCount,
  defaultTripTitle,
  tripDateInZone,
} from "@/features/trips/create-defaults";
import { createTripSchema, setTripStatusSchema, tripIdSchema } from "@/features/trips/schema";
import type { TripStatus } from "@/features/trips/status";
import type { TripActionState } from "@/features/trips/types";
import { updateTrip as updateTripAction } from "@/features/trips/update-trip-action";
import { safeMutationErrorCode } from "@/lib/telemetry/errors";
import { telemetryOperationId, telemetrySurface } from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";
import {
  getAuthProvider,
  getBackendCapabilities,
  getTripRepository,
} from "@/platform/composition/server";
import { getServerProviderConfig } from "@/platform/config/server";

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

async function authenticatedUser() {
  return getAuthProvider().getCurrentUser();
}

export async function updateTrip(state: TripActionState, formData: FormData) {
  return updateTripAction(state, formData);
}

export async function createTrip(
  _state: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const operationId = telemetryOperationId(formData.get("operation_id"));
  const parsed = createTripSchema.safeParse({
    timezone: formData.get("timezone"),
    today: formData.get("today"),
  });
  if (!parsed.success) {
    await captureServerProductEvent(
      "trip_create_failed",
      { error_code: "invalid_input", operation_id: operationId, surface: "trip_list" },
      { actorType: "anonymous", route: "/trips" },
    );
    return { error: firstIssue(parsed.error) };
  }

  const user = await authenticatedUser();
  if (!user) {
    await captureServerProductEvent(
      "trip_create_failed",
      { error_code: "forbidden", operation_id: operationId, surface: "trip_list" },
      { actorType: "anonymous", route: "/trips" },
    );
    return { error: "Sign in to create a trip." };
  }
  const today = parsed.data.today || tripDateInZone(parsed.data.timezone, new Date());
  let createdTripId: string;
  try {
    const repository = getTripRepository();
    const regionalDefault = defaultTripCurrencyForRegion(getServerProviderConfig().appRegion);
    const currency = (await repository.getDefaultCurrencyForCurrentUser()) ?? regionalDefault;
    const locale = await getRequestLocale();
    const trip = await repository.create({
      currency,
      dayCount: defaultTripDayCount,
      locale,
      timezone: parsed.data.timezone,
      title: defaultTripTitle(today),
    });
    await captureServerProductEvent(
      "trip_created",
      { operation_id: operationId, surface: "trip_list" },
      { actorType: "authenticated", appUserId: user.id, route: "/trips" },
    );
    createdTripId = trip.id;
  } catch (error) {
    await captureServerProductEvent(
      "trip_create_failed",
      {
        error_code: safeMutationErrorCode(error),
        operation_id: operationId,
        surface: "trip_list",
      },
      { actorType: "authenticated", route: "/trips", appUserId: user.id },
    );
    return { error: error instanceof Error ? error.message : "Could not create the trip." };
  }
  revalidatePath("/trips");
  redirect(`/trips/${createdTripId}`);
}

/** Completing a trip only changes which Trips filter shows it. */
export async function setTripStatus(input: {
  operationId?: string;
  surface?: "trip_list";
  status: TripStatus;
  tripId: string;
}): Promise<TripActionState> {
  const operationId = telemetryOperationId(input.operationId);
  const surface = telemetrySurface(input.surface) ?? "trip_list";
  const parsed = setTripStatusSchema.safeParse(input);
  if (!parsed.success) {
    if (input.status === "done" || input.status === "open") {
      await captureServerProductEvent(
        "trip_status_changed",
        {
          error_code: "invalid_input",
          operation_id: operationId,
          outcome: "failed",
          surface,
          trip_status: input.status,
        },
        { actorType: "anonymous", route: "/trips" },
      );
    }
    return { error: firstIssue(parsed.error) };
  }

  const user = await authenticatedUser();
  if (!user) {
    await captureServerProductEvent(
      "trip_status_changed",
      {
        error_code: "forbidden",
        operation_id: operationId,
        outcome: "failed",
        surface,
        trip_status: parsed.data.status,
      },
      { actorType: "anonymous", route: "/trips" },
    );
    return { error: "Sign in to update this trip." };
  }
  try {
    await getTripRepository().setStatus(parsed.data.tripId, parsed.data.status);
  } catch (error) {
    await captureServerProductEvent(
      "trip_status_changed",
      {
        error_code: safeMutationErrorCode(error),
        operation_id: operationId,
        outcome: "failed",
        surface,
        trip_status: parsed.data.status,
      },
      { actorType: "authenticated", route: "/trips", appUserId: user.id },
    );
    return {
      error:
        error instanceof Error ? error.message : "You do not have permission to update this trip.",
    };
  }
  await captureServerProductEvent(
    "trip_status_changed",
    {
      operation_id: operationId,
      outcome: "succeeded",
      surface,
      trip_status: parsed.data.status,
    },
    { actorType: "authenticated", route: "/trips", appUserId: user.id },
  );
  revalidatePath("/trips");
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return {
    success: parsed.data.status === "done" ? "Trip marked complete." : "Trip moved to Active.",
  };
}

/** Load share impact only when a list-card delete confirmation is opened. */
export async function countActiveSharePages(tripId: string) {
  const parsed = tripIdSchema.safeParse(tripId);
  if (!parsed.success) return 0;
  if (!(await authenticatedUser())) return 0;
  if (!getBackendCapabilities().signedUrls) return 0;
  const { data } = await listPublicItineraryLinks(parsed.data);
  return data.length;
}

export async function deleteTrip(
  _state: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const operationId = telemetryOperationId(formData.get("operation_id"));
  const surface = telemetrySurface(formData.get("surface")) ?? "trip_list";
  const parsed = tripIdSchema.safeParse(formData.get("trip_id"));
  if (!parsed.success) {
    await captureServerProductEvent(
      "trip_delete_failed",
      { error_code: "invalid_input", operation_id: operationId, surface },
      { actorType: "anonymous", route: "/trips" },
    );
    return { error: firstIssue(parsed.error) };
  }

  const user = await authenticatedUser();
  if (!user) {
    await captureServerProductEvent(
      "trip_delete_failed",
      { error_code: "forbidden", operation_id: operationId, surface },
      { actorType: "anonymous", route: "/trips/[tripId]" },
    );
    redirect("/login");
  }
  try {
    await getTripRepository().remove(parsed.data);
  } catch (error) {
    await captureServerProductEvent(
      "trip_delete_failed",
      {
        error_code: safeMutationErrorCode(error),
        operation_id: operationId,
        surface,
      },
      {
        actorType: "authenticated",
        route: "/trips/[tripId]",
        appUserId: user.id,
      },
    );
    redirect(`/trips/${parsed.data}?error=delete`);
  }
  await captureServerProductEvent(
    "trip_deleted",
    { operation_id: operationId, surface },
    { actorType: "authenticated", route: "/trips/[tripId]", appUserId: user.id },
  );
  if (getBackendCapabilities().signedUrls) await drainAssetDeletionQueue(100);
  redirect("/trips");
}
