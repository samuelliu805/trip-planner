import "server-only";

import { randomUUID } from "node:crypto";

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

async function rows(query: PromiseLike<{ data: unknown; error: unknown }>, message: string) {
  return cloudBaseData(await query, message);
}

async function tripById(db: CloudBaseDatabase, id: string) {
  const data = await rows(
    db.from("trips").select("*").eq("id", id),
    "The trip could not be loaded.",
  );
  const trips = normalizeTrips(data);
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

function assertOwner(trip: Trip, userId: string) {
  if (trip.owner_id !== userId) {
    throw new PlatformOperationError(
      "forbidden",
      "You do not have permission to modify this trip.",
    );
  }
}

export class CloudBaseTripRepository implements TripRepository {
  async listForCurrentUser(input: { status?: TripStatus } = {}) {
    const { db } = await createCloudBaseUserContext();
    let query = db.from("trips").select("*");
    if (input.status) query = query.eq("status", input.status);
    const trips = normalizeTrips(await rows(query, "Trips could not be loaded."));
    const withVariants = await Promise.all(trips.map((trip) => attachPrimaryVariant(db, trip)));
    return withVariants.sort((left, right) =>
      (left.start_date ?? "9999-12-31").localeCompare(right.start_date ?? "9999-12-31"),
    );
  }

  async getById(id: string) {
    const { db } = await createCloudBaseUserContext();
    return tripById(db, id);
  }

  async getDefaultCurrencyForCurrentUser() {
    const { db } = await createCloudBaseUserContext();
    const data = await rows(
      db.from("profiles").select("default_currency"),
      "Account preferences could not be loaded.",
    );
    if (!Array.isArray(data) || !data.length) return null;
    const value = (data[0] as Record<string, unknown>).default_currency;
    return typeof value === "string" ? value : null;
  }

  async create(input: CreateTripInput) {
    const { db } = await createCloudBaseUserContext();
    const recoveryTitle = `__trip_create_${randomUUID()}`;
    const id = await cloudBaseScalarUuidRpc({
      execute: () =>
        db.rpc("create_trip", {
          trip_currency: input.currency,
          trip_day_count: input.dayCount,
          trip_end_date: null,
          trip_start_date: null,
          trip_timezone: input.timezone,
          trip_title: recoveryTitle,
        }),
      recover: async () => {
        const data = await rows(
          db.from("trips").select("id").eq("title", recoveryTitle),
          "The created trip could not be recovered.",
        );
        if (!Array.isArray(data) || data.length !== 1) {
          throw new PlatformOperationError(
            "unexpected",
            "The created trip could not be uniquely recovered.",
          );
        }
        return data[0];
      },
      safeMessage: "The trip could not be created.",
    });
    try {
      return await this.update(id, {
        currency: input.currency,
        dayCount: input.dayCount,
        endDate: null,
        startDate: null,
        timezone: input.timezone,
        title: input.title,
      });
    } catch (error) {
      await db.from("trips").delete().eq("id", id);
      throw error;
    }
  }

  async update(id: string, input: UpdateTripInput) {
    const { db } = await createCloudBaseUserContext();
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
        }),
      recover: async () => {
        const trip = await tripById(db, id);
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
    const trip = await tripById(db, id);
    if (!trip) throw new PlatformOperationError("not_found", "The updated trip was not found.");
    return trip;
  }

  async setStatus(id: string, status: TripStatus) {
    const { db, user } = await createCloudBaseUserContext();
    const trip = await tripById(db, id);
    if (!trip) throw new PlatformOperationError("not_found", "The trip was not found.");
    assertOwner(trip, user.id);
    await rows(
      db.from("trips").update({ status }).eq("id", id),
      "The trip status could not be updated.",
    );
    return { ...trip, status };
  }

  async renameIfTitle(id: string, currentTitle: string, nextTitle: string) {
    const { db, user } = await createCloudBaseUserContext();
    const trip = await tripById(db, id);
    if (!trip) return false;
    assertOwner(trip, user.id);
    if (trip.title !== currentTitle) return false;
    await rows(
      db.from("trips").update({ title: nextTitle }).eq("id", id).eq("title", currentTitle),
      "The trip title could not be updated.",
    );
    return true;
  }

  async remove(id: string) {
    const { db, user } = await createCloudBaseUserContext();
    const trip = await tripById(db, id);
    if (!trip) throw new PlatformOperationError("not_found", "The trip was not found.");
    assertOwner(trip, user.id);
    await rows(db.from("trips").delete().eq("id", id), "The trip could not be removed.");
    if (await tripById(db, id)) {
      throw new PlatformOperationError("unexpected", "The trip could not be removed.");
    }
  }
}
