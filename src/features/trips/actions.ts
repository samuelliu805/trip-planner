"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createTripSchema, tripIdSchema, updateTripSchema } from "@/features/trips/schema";
import type { TripActionState } from "@/features/trips/types";
import { createClient } from "@/lib/supabase/server";

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export async function createTrip(
  _state: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const parsed = createTripSchema.safeParse({
    title: formData.get("title"),
    startDate: formData.get("start_date"),
    endDate: formData.get("end_date"),
    dayCount: formData.get("day_count") || undefined,
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_trip", {
    trip_title: parsed.data.title,
    trip_start_date: parsed.data.startDate || undefined,
    trip_end_date: parsed.data.endDate || undefined,
    trip_day_count: parsed.data.dayCount,
    trip_timezone: parsed.data.timezone,
    trip_currency: parsed.data.currency,
  });

  if (error || !data) return { error: error?.message ?? "Could not create the trip." };
  redirect(`/trips/${data}`);
}

export async function updateTrip(
  _state: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const parsed = updateTripSchema.safeParse({
    tripId: formData.get("trip_id"),
    title: formData.get("title"),
    timezone: formData.get("timezone"),
    currency: formData.get("currency"),
    startDate: formData.get("start_date"),
    endDate: formData.get("end_date"),
    dayCount: formData.get("day_count"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_trip_plan", {
    target_trip_id: parsed.data.tripId,
    trip_title: parsed.data.title,
    trip_start_date: parsed.data.startDate || null,
    trip_end_date: parsed.data.endDate || null,
    trip_day_count: parsed.data.dayCount,
    trip_timezone: parsed.data.timezone,
    trip_currency: parsed.data.currency,
  } as never);

  if (error || !data)
    return { error: error?.message ?? "You do not have permission to update this trip." };
  revalidatePath("/trips");
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { success: "Trip settings saved." };
}

export async function deleteTrip(formData: FormData) {
  const parsed = tripIdSchema.safeParse(formData.get("trip_id"));
  if (!parsed.success) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .delete()
    .eq("id", parsed.data)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/trips/${parsed.data}?error=delete`);
  redirect("/trips");
}
