"use server";

import { revalidatePath } from "next/cache";

import { updateTripSchema } from "@/features/trips/schema";
import type { TripActionState } from "@/features/trips/types";
import { createClient } from "@/lib/supabase/server";
import { safeMutationErrorCode } from "@/lib/telemetry/errors";
import { telemetryOperationId, telemetrySurface } from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";

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

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    await captureServerProductEvent(
      "trip_settings_save_failed",
      { error_code: "forbidden", operation_id: operationId, surface },
      { actorType: "anonymous", route: "/trips/[tripId]" },
    );
    return { error: "Sign in to update this trip." };
  }
  const userId = authData.user.id;
  const { data, error } = await supabase.rpc("update_trip_plan", {
    target_trip_id: parsed.data.tripId,
    trip_title: parsed.data.title,
    trip_start_date: parsed.data.startDate || null,
    trip_end_date: parsed.data.endDate || null,
    trip_day_count: parsed.data.dayCount,
    trip_timezone: parsed.data.timezone,
    trip_currency: parsed.data.currency,
  } as never);

  if (error || !data) {
    await captureServerProductEvent(
      "trip_settings_save_failed",
      {
        error_code: error ? safeMutationErrorCode(error) : "forbidden",
        operation_id: operationId,
        surface,
      },
      {
        actorType: "authenticated",
        route: "/trips/[tripId]",
        supabaseUserId: userId,
      },
    );
    return { error: error?.message ?? "You do not have permission to update this trip." };
  }
  await captureServerProductEvent(
    "trip_settings_saved",
    { operation_id: operationId, surface },
    { actorType: "authenticated", route: "/trips/[tripId]", supabaseUserId: userId },
  );
  revalidatePath("/trips");
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { success: "Trip settings saved." };
}
