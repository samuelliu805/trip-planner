import "server-only";

import type {
  CreateTripInput,
  TripRepository,
  TripStatus,
  UpdateTripInput,
} from "@/platform/contracts/trips";
import { PlatformOperationError } from "@/platform/contracts/errors";
import { normalizeTrip, normalizeTrips } from "@/platform/trips/normalization";

import { createSupabaseServerClient } from "./server";

function repositoryError(message: string, cause?: { code?: string; message?: string } | null) {
  const code = cause?.code;
  if (code === "42501")
    return new PlatformOperationError("forbidden", "You do not have permission to do that.", {
      cause,
    });
  if (code === "22023" || code === "23514")
    return new PlatformOperationError("validation_failed", cause?.message ?? message, { cause });
  if (code === "23505") return new PlatformOperationError("conflict", message, { cause });
  return new PlatformOperationError("unexpected", message, { cause });
}

export class SupabaseTripRepository implements TripRepository {
  async listForCurrentUser(input: { status?: string } = {}) {
    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("trips")
      .select("*, route_variants(id, name, color, is_primary)")
      .eq("route_variants.is_primary", true);
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query.order("start_date", { ascending: true });
    if (error) throw repositoryError("Trips could not be loaded.", error);
    return normalizeTrips(data ?? []);
  }

  async getById(id: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
    if (error) throw repositoryError("The trip could not be loaded.", error);
    return data ? normalizeTrip(data) : null;
  }

  async getDefaultCurrencyForCurrentUser() {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    const { data, error } = await supabase
      .from("profiles")
      .select("default_currency")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw repositoryError("Account preferences could not be loaded.", error);
    return data?.default_currency ?? null;
  }

  async create(input: CreateTripInput) {
    const supabase = await createSupabaseServerClient();
    const { data: id, error } = await supabase.rpc("create_trip", {
      trip_currency: input.currency,
      trip_day_count: input.dayCount,
      trip_timezone: input.timezone,
      trip_title: input.title,
    });
    if (error || !id) throw repositoryError("The trip could not be created.", error);
    const trip = await this.getById(id);
    if (!trip) throw new PlatformOperationError("not_found", "The created trip was not found.");
    return trip;
  }

  async update(id: string, input: UpdateTripInput) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("update_trip_plan", {
      target_trip_id: id,
      trip_currency: input.currency,
      trip_day_count: input.dayCount,
      trip_end_date: input.endDate,
      trip_start_date: input.startDate,
      trip_timezone: input.timezone,
      trip_title: input.title,
    } as never);
    if (error || !data) throw repositoryError("The trip could not be updated.", error);
    const trip = await this.getById(id);
    if (!trip) throw new PlatformOperationError("not_found", "The updated trip was not found.");
    return trip;
  }

  async setStatus(id: string, status: TripStatus) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    const { data, error } = await supabase
      .from("trips")
      .update({ status })
      .eq("id", id)
      .eq("owner_id", user.id)
      .select("*")
      .maybeSingle();
    if (error) throw repositoryError("The trip status could not be updated.", error);
    if (!data)
      throw new PlatformOperationError(
        "forbidden",
        "You do not have permission to update this trip.",
      );
    return normalizeTrip(data);
  }

  async renameIfTitle(id: string, currentTitle: string, nextTitle: string) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    const { data, error } = await supabase
      .from("trips")
      .update({ title: nextTitle })
      .eq("id", id)
      .eq("owner_id", user.id)
      .eq("title", currentTitle)
      .select("id")
      .maybeSingle();
    if (error) throw repositoryError("The trip title could not be updated.", error);
    return Boolean(data);
  }

  async remove(id: string) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      throw new PlatformOperationError("authentication_required", "Authentication is required.");
    const { data, error } = await supabase
      .from("trips")
      .delete()
      .eq("id", id)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw repositoryError("The trip could not be removed.", error);
    if (!data) throw new PlatformOperationError("not_found", "The trip was not found.");
  }
}
