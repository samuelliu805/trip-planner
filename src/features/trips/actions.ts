"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { listPublicItineraryLinks } from "@/features/sharing/data";
import {
  defaultTripCurrency,
  defaultTripDayCount,
  defaultTripTitle,
  tripDateInZone,
} from "@/features/trips/create-defaults";
import { createTripSchema, setTripStatusSchema, tripIdSchema } from "@/features/trips/schema";
import type { TripStatus } from "@/features/trips/status";
import type { TripActionState } from "@/features/trips/types";
import { updateTrip as updateTripAction } from "@/features/trips/update-trip-action";
import { createClient } from "@/lib/supabase/server";
import { safeMutationErrorCode } from "@/lib/telemetry/errors";
import { telemetryOperationId, telemetrySurface } from "@/lib/telemetry/product";
import { captureServerProductEvent } from "@/lib/telemetry/product-server";

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, userId: data.user.id } : null;
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

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    await captureServerProductEvent(
      "trip_create_failed",
      { error_code: "forbidden", operation_id: operationId, surface: "trip_list" },
      { actorType: "anonymous", route: "/trips" },
    );
    return { error: "Sign in to create a trip." };
  }
  const userId = authData.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("default_currency")
    .eq("id", userId)
    .maybeSingle();
  const today = parsed.data.today || tripDateInZone(parsed.data.timezone, new Date());
  const { data, error } = await supabase.rpc("create_trip", {
    trip_title: defaultTripTitle(today),
    trip_day_count: defaultTripDayCount,
    trip_timezone: parsed.data.timezone,
    trip_currency: profile?.default_currency ?? defaultTripCurrency,
  });

  if (error || !data) {
    await captureServerProductEvent(
      "trip_create_failed",
      {
        error_code: safeMutationErrorCode(error),
        operation_id: operationId,
        surface: "trip_list",
      },
      { actorType: "authenticated", route: "/trips", supabaseUserId: userId },
    );
    return { error: error?.message ?? "Could not create the trip." };
  }
  await captureServerProductEvent(
    "trip_created",
    { operation_id: operationId, surface: "trip_list" },
    { actorType: "authenticated", route: "/trips", supabaseUserId: userId },
  );
  revalidatePath("/trips");
  redirect(`/trips/${data}`);
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

  const auth = await authenticatedClient();
  if (!auth) {
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
  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("trips")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.tripId)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    await captureServerProductEvent(
      "trip_status_changed",
      {
        error_code: error ? safeMutationErrorCode(error) : "forbidden",
        operation_id: operationId,
        outcome: "failed",
        surface,
        trip_status: parsed.data.status,
      },
      { actorType: "authenticated", route: "/trips", supabaseUserId: userId },
    );
    return { error: error?.message ?? "You do not have permission to update this trip." };
  }
  await captureServerProductEvent(
    "trip_status_changed",
    {
      operation_id: operationId,
      outcome: "succeeded",
      surface,
      trip_status: parsed.data.status,
    },
    { actorType: "authenticated", route: "/trips", supabaseUserId: userId },
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
  if (!(await authenticatedClient())) return 0;
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

  const auth = await authenticatedClient();
  if (!auth) {
    await captureServerProductEvent(
      "trip_delete_failed",
      { error_code: "forbidden", operation_id: operationId, surface },
      { actorType: "anonymous", route: "/trips/[tripId]" },
    );
    redirect("/login");
  }
  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("trips")
    .delete()
    .eq("id", parsed.data)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    await captureServerProductEvent(
      "trip_delete_failed",
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
    redirect(`/trips/${parsed.data}?error=delete`);
  }
  await captureServerProductEvent(
    "trip_deleted",
    { operation_id: operationId, surface },
    { actorType: "authenticated", route: "/trips/[tripId]", supabaseUserId: userId },
  );
  await drainAssetDeletionQueue(100);
  redirect("/trips");
}
