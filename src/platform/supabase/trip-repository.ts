import "server-only";

import type {
  CreateTripInput,
  TripHistoryFilterField,
  TripHistoryQuery,
  TripRepository,
  TripStatus,
  UpdateTripInput,
} from "@/platform/contracts/trips";
import { PlatformOperationError } from "@/platform/contracts/errors";
import { normalizeTrip, normalizeTrips } from "@/platform/trips/normalization";
import { normalizeTripStorageStats } from "@/platform/trips/storage-stats";

import { createSupabaseServerClient } from "./server";

const historyFilterFields = new Set<TripHistoryFilterField>([
  "email",
  "event",
  "entity",
  "changed_field",
]);

function isHistoryFilterField(value: string): value is TripHistoryFilterField {
  return historyFilterFields.has(value as TripHistoryFilterField);
}

function repositoryError(message: string, cause?: { code?: string; message?: string } | null) {
  const code = cause?.code;
  if (code === "42501")
    return new PlatformOperationError("forbidden", "You do not have permission to do that.", {
      cause,
    });
  if (code === "22023" || code === "23514")
    return new PlatformOperationError("validation_failed", cause?.message ?? message, { cause });
  if (code === "23505" || code === "40001")
    return new PlatformOperationError("conflict", "Someone else saved this trip first.", { cause });
  return new PlatformOperationError("unexpected", message, { cause });
}

export class SupabaseTripRepository implements TripRepository {
  async listForCurrentUser(input: { status?: string } = {}) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let query = supabase
      .from("trips")
      .select("*, route_variants(id, name, color, is_primary)")
      .eq("route_variants.is_primary", true);
    if (input.status) query = query.eq("status", input.status);
    const { data, error } = await query.order("start_date", { ascending: true });
    if (error) throw repositoryError("Trips could not be loaded.", error);
    return normalizeTrips(data ?? [], user?.id);
  }

  async getById(id: string) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("trips").select("*").eq("id", id).maybeSingle();
    if (error) throw repositoryError("The trip could not be loaded.", error);
    return data ? normalizeTrip(data, user?.id) : null;
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
    const { data: id, error } = await supabase.rpc("create_trip_v3", {
      target_operation_id: input.operationId,
      trip_currency: input.currency,
      trip_day_count: input.dayCount,
      trip_end_date: null as unknown as string,
      trip_locale: input.locale,
      trip_start_date: null as unknown as string,
      trip_timezone: input.timezone,
      trip_title: input.title,
    });
    if (error || !id) throw repositoryError("The trip could not be created.", error);
    const trip = await this.getById(id);
    if (!trip) throw new PlatformOperationError("not_found", "The created trip was not found.");
    return trip;
  }

  async importGuestDraft(input: {
    draftId: string;
    locale: "en" | "zh-CN";
    payload: import("@/types/database").Json;
  }) {
    const supabase = await createSupabaseServerClient();
    const { data: id, error } = await supabase.rpc("import_guest_trip_v1", {
      guest_draft_id: input.draftId,
      guest_locale: input.locale,
      guest_payload: input.payload,
    });
    if (error || !id)
      throw repositoryError("The local trip could not be saved to your account.", error);
    const trip = await this.getById(id);
    if (!trip) throw new PlatformOperationError("not_found", "The imported trip was not found.");
    return trip;
  }

  async update(id: string, input: UpdateTripInput) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("update_trip_plan_v2", {
      target_trip_id: id,
      trip_currency: input.currency,
      trip_day_count: input.dayCount,
      trip_end_date: input.endDate,
      trip_start_date: input.startDate,
      trip_timezone: input.timezone,
      trip_title: input.title,
      expected_version: input.expectedVersion,
      expected_content_version: input.expectedContentVersion,
      target_operation_id: input.operationId,
    } as never);
    if (error || !data) throw repositoryError("The trip could not be updated.", error);
    const trip = await this.getById(id);
    if (!trip) throw new PlatformOperationError("not_found", "The updated trip was not found.");
    return trip;
  }

  async setStatus(id: string, status: TripStatus, expectedVersion: number, operationId: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("update_trip_status", {
      expected_version: expectedVersion,
      target_operation_id: operationId,
      target_status: status,
      target_trip_id: id,
    });
    if (error) throw repositoryError("The trip status could not be updated.", error);
    if (!data) throw new PlatformOperationError("unexpected", "The trip status was not confirmed.");
    const trip = await this.getById(id);
    if (!trip) throw new PlatformOperationError("not_found", "The trip was not found.");
    return trip;
  }

  async renameIfTitle(
    id: string,
    currentTitle: string,
    nextTitle: string,
    expectedVersion: number,
    operationId: string,
  ) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("rename_trip_if_title_v2", {
      current_title: currentTitle,
      expected_version: expectedVersion,
      next_title: nextTitle,
      target_operation_id: operationId,
      target_trip_id: id,
    });
    if (error) throw repositoryError("The trip title could not be updated.", error);
    return Boolean(data);
  }

  async remove(
    id: string,
    expectedVersion: number,
    expectedContentVersion: number,
    operationId: string,
  ) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("delete_trip_v3", {
      expected_content_version: expectedContentVersion,
      expected_version: expectedVersion,
      target_operation_id: operationId,
      target_trip_id: id,
    });
    if (error) throw repositoryError("The trip could not be removed.", error);
    if (!data) throw new PlatformOperationError("not_found", "The trip was not found.");
  }

  async listMembers(id: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_trip_members", { target_trip_id: id });
    if (error) throw repositoryError("Trip members could not be loaded.", error);
    return (data ?? []).map((row) => ({
      displayLabel: row.display_label,
      joinedAt: row.joined_at,
      memberId: row.member_id,
      role: row.role as "owner" | "collaborator",
      userId: row.member_key,
    }));
  }

  async inviteCollaborator(id: string, identifier: string, operationId: string) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("invite_trip_collaborator", {
      target_identifier: identifier,
      target_operation_id: operationId,
      target_trip_id: id,
    });
    if (error) throw repositoryError("The collaborator could not be invited.", error);
  }

  async removeCollaborator(id: string, memberId: string, operationId: string) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.rpc("remove_trip_collaborator", {
      target_member_id: memberId,
      target_operation_id: operationId,
      target_trip_id: id,
    });
    if (error) throw repositoryError("The collaborator could not be removed.", error);
  }

  async listHistory(id: string, query: TripHistoryQuery) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_trip_history_v2", {
      target_trip_id: id,
      before_created_at: query.cursor?.createdAt,
      before_id: query.cursor?.id,
      requested_limit: Math.min(query.pageSize + 1, 51),
      target_category: query.category,
      target_filter_field: query.filterField,
      target_filter_value: query.filterValue,
    });
    if (error) throw repositoryError("Trip history could not be loaded.", error);
    const rows = data ?? [];
    const visible = rows.slice(0, query.pageSize);
    const entries = visible.map((row) => ({
      actorLabel: row.actor_label_snapshot,
      changes: row.changes,
      createdAt: row.created_at,
      entityType: row.entity_type,
      eventType: row.event_type,
      id: row.id,
    }));
    const last = visible.at(-1);
    return {
      entries,
      nextCursor:
        rows.length > query.pageSize && last ? { createdAt: last.created_at, id: last.id } : null,
    };
  }

  async listHistoryFilterOptions(id: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("list_trip_history_filter_options_v1", {
      target_trip_id: id,
    });
    if (error) throw repositoryError("History filters could not be loaded.", error);
    return (data ?? []).flatMap((row) => {
      const value = row.filter_value.trim();
      return isHistoryFilterField(row.filter_field) && value
        ? [{ field: row.filter_field, value }]
        : [];
    });
  }

  async getStorageStats(id: string) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("trip_collaboration_storage_stats_v2", {
      target_trip_id: id,
    });
    if (error) throw repositoryError("Trip storage usage could not be loaded.", error);
    return normalizeTripStorageStats(data);
  }
}
