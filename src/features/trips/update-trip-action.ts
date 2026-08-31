"use server";

import { revalidatePath } from "next/cache";

import { updateTripSchema } from "@/features/trips/schema";
import type { TripActionState } from "@/features/trips/types";
import { safeMutationErrorCode } from "@/lib/telemetry/errors";
import { telemetryOperationId, telemetrySurface } from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";
import { getAuthProvider, getTripRepository } from "@/platform/composition/server";

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export async function updateTrip(
  _state: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const operationId = telemetryOperationId(formData.get("operation_id"));
  const surface = telemetrySurface(formData.get("surface")) ?? "planner_app_bar";
  const parsed = updateTripSchema.safeParse({
    tripId: formData.get("trip_id"),
    title: formData.get("title"),
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
    startDate: formData.get("start_date"),
    endDate: formData.get("end_date"),
    dayCount: formData.get("day_count"),
  });
  if (!parsed.success) {
    await captureServerProductEvent(
      "trip_settings_save_failed",
      { error_code: "invalid_input", operation_id: operationId, surface },
      { actorType: "anonymous", route: "/trips/[tripId]" },
    );
    return { error: firstIssue(parsed.error) };
  }

  const user = await getAuthProvider().getCurrentUser();
  if (!user) {
    await captureServerProductEvent(
      "trip_settings_save_failed",
      { error_code: "forbidden", operation_id: operationId, surface },
      { actorType: "anonymous", route: "/trips/[tripId]" },
    );
    return { error: "Sign in to update this trip." };
  }
  try {
    await getTripRepository().update(parsed.data.tripId, {
      currency: parsed.data.currency,
      dayCount: parsed.data.dayCount,
      endDate: parsed.data.endDate || null,
      startDate: parsed.data.startDate || null,
      timezone: parsed.data.timezone,
      title: parsed.data.title,
    });
  } catch (error) {
    await captureServerProductEvent(
      "trip_settings_save_failed",
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
    return {
      error:
        error instanceof Error ? error.message : "You do not have permission to update this trip.",
    };
  }
  await captureServerProductEvent(
    "trip_settings_saved",
    { operation_id: operationId, surface },
    { actorType: "authenticated", route: "/trips/[tripId]", appUserId: user.id },
  );
  revalidatePath("/trips");
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { success: "Trip settings saved." };
}
