import "server-only";

import { PlatformOperationError } from "@/platform/contracts/errors";
import type {
  CreateTripInput,
  Trip,
  TripRepository,
  TripStatus,
  UpdateTripInput,
} from "@/platform/contracts/trips";
import {
  normalizeRouteVariants,
  normalizeTrip,
  normalizeTrips,
} from "@/platform/trips/normalization";

import type { CloudBaseDatabase } from "./client";
import { createCloudBaseUserContext } from "./database";
import { cloudBaseData } from "./errors";
import { cloudBaseScalarUuidRpc } from "./rpc-compat";
import { explicitCloudBaseCurrency } from "./profile-currency";

async function rows(query: PromiseLike<{ data: unknown; error: unknown }>, message: string) {
  return cloudBaseData(await query, message);
}

async function tripById(db: CloudBaseDatabase, id: string, currentUserId: string) {
  const data = await rows(
    db.from("trips").select("*").eq("id", id),
    "The trip could not be loaded.",
  );
  const trips = normalizeTrips(data, currentUserId);
  if (trips.length > 1) {
    throw new PlatformOperationError("unexpected", "The trip query returned duplicate rows.");
  }
  return trips[0] ?? null;
}

async function attachPrimaryVariant(db: CloudBaseDatabase, trip: Trip) {
  const data = await rows(
    db
      .from("route_variants")
      .select("id, name, color, is_primary")
      .eq("trip_id", trip.id)
      .eq("is_primary", true),
    "The trip route could not be loaded.",
  );
  return normalizeTrip({ ...trip, route_variants: normalizeRouteVariants(data) });
}

export class CloudBaseTripRepository implements TripRepository {
  async listForCurrentUser(input: { status?: TripStatus } = {}) {
    const { db, user } = await createCloudBaseUserContext();
    let query = db.from("trips").select("*");
    if (input.status) query = query.eq("status", input.status);
    const trips = normalizeTrips(await rows(query, "Trips could not be loaded."), user.id);
    const withVariants = await Promise.all(trips.map((trip) => attachPrimaryVariant(db, trip)));
    return withVariants.sort((left, right) =>
      (left.start_date ?? "9999-12-31").localeCompare(right.start_date ?? "9999-12-31"),
    );
  }

  async getById(id: string) {
    const { db, user } = await createCloudBaseUserContext();
    return tripById(db, id, user.id);
  }

  async getDefaultCurrencyForCurrentUser() {
    const { db } = await createCloudBaseUserContext();
    const data = await rows(
      db.from("profiles").select("default_currency, default_currency_is_explicit"),
      "Account preferences could not be loaded.",
    );
    if (!Array.isArray(data) || !data.length) return null;
    const row = data[0] as Record<string, unknown>;
    return explicitCloudBaseCurrency(row.default_currency, row.default_currency_is_explicit);
  }

  async create(input: CreateTripInput) {
    const { db } = await createCloudBaseUserContext();
    const id = await cloudBaseScalarUuidRpc({
      execute: () =>
        db.rpc("create_trip_v3", {
          target_operation_id: input.operationId,
          trip_currency: input.currency,
          trip_day_count: input.dayCount,
          trip_end_date: null,
          trip_locale: input.locale,
          trip_start_date: null,
          trip_timezone: input.timezone,
          trip_title: input.title,
        }),
      recover: async () => {
        const recovered = cloudBaseData(
          await db.rpc("recover_trip_creation_v1", {
            target_operation_id: input.operationId,
          }),
          "The created trip could not be recovered.",
        ) as { tripId?: string } | null;
        return recovered?.tripId ? { id: recovered.tripId } : null;
      },
      safeMessage: "The trip could not be created.",
    });
    const trip = await this.getById(id);
    if (!trip) throw new PlatformOperationError("not_found", "The created trip was not found.");
    return trip;
  }

  async importGuestDraft(input: {
    draftId: string;
    locale: "en" | "zh-CN";
    payload: import("@/types/database").Json;
  }) {
    const { db, user } = await createCloudBaseUserContext();
    const id = await cloudBaseScalarUuidRpc({
      execute: () =>
        db.rpc("import_guest_trip_v1", {
          guest_draft_id: input.draftId,
          guest_locale: input.locale,
          guest_payload: input.payload,
        }),
      recover: async () => {
        const data = await rows(
          db.from("trips").select("id").eq("guest_draft_id", input.draftId),
          "The imported trip could not be recovered.",
        );
        return Array.isArray(data) && data.length === 1 ? data[0] : null;
      },
      safeMessage: "The local trip could not be saved to your account.",
    });
    const trip = await tripById(db, id, user.id);
    if (!trip) throw new PlatformOperationError("not_found", "The imported trip was not found.");
    return trip;
  }

  async update(id: string, input: UpdateTripInput) {
    const { db, user } = await createCloudBaseUserContext();
    await cloudBaseScalarUuidRpc({
      execute: () =>
        db.rpc("update_trip_plan", {
          target_trip_id: id,
          trip_currency: input.currency,
          trip_day_count: input.dayCount,
          trip_end_date: input.endDate,
          trip_start_date: input.startDate,
          trip_timezone: input.timezone,
          trip_title: input.title,
          expected_version: input.expectedVersion,
          target_operation_id: input.operationId,
        }),
      recover: async () => {
        const trip = await tripById(db, id, user.id);
        return trip &&
          trip.currency === input.currency &&
          trip.day_count === input.dayCount &&
          trip.end_date === input.endDate &&
          trip.start_date === input.startDate &&
          trip.timezone === input.timezone &&
          trip.title === input.title
          ? id
          : null;
      },
      safeMessage: "The trip could not be updated.",
    });
    const trip = await tripById(db, id, user.id);
    if (!trip) throw new PlatformOperationError("not_found", "The updated trip was not found.");
    return trip;
  }

  async setStatus(id: string, status: TripStatus, expectedVersion: number, operationId: string) {
    const { db, user } = await createCloudBaseUserContext();
    await cloudBaseScalarUuidRpc({
      execute: () =>
        db.rpc("update_trip_status", {
          expected_version: expectedVersion,
          target_operation_id: operationId,
          target_status: status,
          target_trip_id: id,
        }),
      recover: async () => ((await tripById(db, id, user.id))?.status === status ? id : null),
      safeMessage: "The trip status could not be updated.",
    });
    const trip = await tripById(db, id, user.id);
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
    const { db } = await createCloudBaseUserContext();
    return Boolean(
      cloudBaseData(
        await db.rpc("rename_trip_if_title_v2", {
          current_title: currentTitle,
          expected_version: expectedVersion,
          next_title: nextTitle,
          target_operation_id: operationId,
          target_trip_id: id,
        }),
        "The trip title could not be updated.",
      ),
    );
  }

  async remove(id: string, expectedVersion: number, operationId: string) {
    const { db } = await createCloudBaseUserContext();
    const result = await db.rpc("delete_trip_v2", {
      expected_version: expectedVersion,
      target_operation_id: operationId,
      target_trip_id: id,
    });
    cloudBaseData(result, "The trip could not be removed.");
  }

  async listMembers(id: string) {
    const { db } = await createCloudBaseUserContext();
    const data = await rows(
      db.rpc("list_trip_members", { target_trip_id: id }),
      "Trip members could not be loaded.",
    );
    if (!Array.isArray(data))
      throw new PlatformOperationError("unexpected", "Trip members returned invalid data.");
    return data.map((value) => {
      const row = value as Record<string, unknown>;
      return {
        displayLabel: String(row.display_label),
        joinedAt: String(row.joined_at),
        memberId: String(row.member_id),
        role: String(row.role) as "owner" | "collaborator",
        userId: String(row.member_key),
      };
    });
  }

  async inviteCollaborator(id: string, identifier: string, operationId: string) {
    const { db } = await createCloudBaseUserContext();
    cloudBaseData(
      await db.rpc("invite_trip_collaborator", {
        target_identifier: identifier,
        target_operation_id: operationId,
        target_trip_id: id,
      }),
      "The collaborator could not be invited.",
    );
  }

  async removeCollaborator(id: string, memberId: string, operationId: string) {
    const { db } = await createCloudBaseUserContext();
    cloudBaseData(
      await db.rpc("remove_trip_collaborator", {
        target_member_id: memberId,
        target_operation_id: operationId,
        target_trip_id: id,
      }),
      "The collaborator could not be removed.",
    );
  }

  async listHistory(id: string, cursor?: { createdAt: string; id: string }) {
    const { db } = await createCloudBaseUserContext();
    const data = await rows(
      db.rpc("list_trip_history", {
        target_trip_id: id,
        before_created_at: cursor?.createdAt ?? null,
        before_id: cursor?.id ?? null,
        requested_limit: 51,
      }),
      "Trip history could not be loaded.",
    );
    if (!Array.isArray(data))
      throw new PlatformOperationError("unexpected", "Trip history returned invalid data.");
    const visible = data.slice(0, 50);
    const entries = visible.map((value) => {
      const row = value as Record<string, unknown>;
      return {
        actorLabel: String(row.actor_label_snapshot),
        changes: row.changes as import("@/types/database").Json,
        createdAt: String(row.created_at),
        eventType: String(row.event_type),
        id: String(row.id),
      };
    });
    const last = entries.at(-1);
    return {
      entries,
      nextCursor: data.length > 50 && last ? { createdAt: last.createdAt, id: last.id } : null,
    };
  }
}
