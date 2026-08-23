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
import {
  createTripSchema,
  setTripStatusSchema,
  tripIdSchema,
  updateTripSchema,
} from "@/features/trips/schema";
import type { TripStatus } from "@/features/trips/status";
import type { TripActionState } from "@/features/trips/types";
import { createClient } from "@/lib/supabase/server";

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ? { supabase, userId: data.user.id } : null;
}

export async function createTrip(
  _state: TripActionState,
  formData: FormData,
): Promise<TripActionState> {
  const parsed = createTripSchema.safeParse({
    timezone: formData.get("timezone"),
    today: formData.get("today"),
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const auth = await authenticatedClient();
  if (!auth) return { error: "Sign in to create a trip." };
  const { supabase } = auth;
  const today = parsed.data.today || tripDateInZone(parsed.data.timezone, new Date());
  const { data, error } = await supabase.rpc("create_trip", {
    trip_title: defaultTripTitle(today),
    trip_day_count: defaultTripDayCount,
    trip_timezone: parsed.data.timezone,
    trip_currency: defaultTripCurrency,
  });

  if (error || !data) return { error: error?.message ?? "Could not create the trip." };
  revalidatePath("/trips");
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

  const auth = await authenticatedClient();
  if (!auth) return { error: "Sign in to update this trip." };
  const { supabase } = auth;
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

/** Completing a trip only changes which Trips filter shows it. */
export async function setTripStatus(input: {
  status: TripStatus;
  tripId: string;
}): Promise<TripActionState> {
  const parsed = setTripStatusSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const auth = await authenticatedClient();
  if (!auth) return { error: "Sign in to update this trip." };
  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("trips")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.tripId)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();

  if (error || !data)
    return { error: error?.message ?? "You do not have permission to update this trip." };
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
  const parsed = tripIdSchema.safeParse(formData.get("trip_id"));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const auth = await authenticatedClient();
  if (!auth) redirect("/login");
  const { supabase, userId } = auth;
  const { data, error } = await supabase
    .from("trips")
    .delete()
    .eq("id", parsed.data)
    .eq("owner_id", userId)
    .select("id")
    .maybeSingle();
  if (error || !data) redirect(`/trips/${parsed.data}?error=delete`);
  await drainAssetDeletionQueue(100);
  redirect("/trips");
}
