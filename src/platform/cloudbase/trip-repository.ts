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
import { explicitCloudBaseCurrency } from "./profile-currency";
import {
  removeCloudBaseTrip,
  renameCloudBaseTripIfTitle,
  setCloudBaseTripStatus,
} from "./trip-mutations";

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
      db.from("profiles").select("default_currency, default_currency_is_explicit"),
      "Account preferences could not be loaded.",
    );
    if (!Array.isArray(data) || !data.length) return null;
    const row = data[0] as Record<string, unknown>;
    return explicitCloudBaseCurrency(row.default_currency, row.default_currency_is_explicit);
  }

  async create(input: CreateTripInput) {
    const { db } = await createCloudBaseUserContext();
    const recoveryTitle = `__trip_create_${randomUUID()}`;
    const id = await cloudBaseScalarUuidRpc({
      execute: () =>
        db.rpc("create_trip_v2", {
          trip_currency: input.currency,
          trip_day_count: input.dayCount,
          trip_end_date: null,
          trip_locale: input.locale,
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
    return setCloudBaseTripStatus(db, user.id, id, status);
  }

  async renameIfTitle(id: string, currentTitle: string, nextTitle: string) {
    const { db, user } = await createCloudBaseUserContext();
    return renameCloudBaseTripIfTitle(db, user.id, id, currentTitle, nextTitle);
  }

  async remove(id: string) {
    const { db, user } = await createCloudBaseUserContext();
    await removeCloudBaseTrip(db, user.id, id);
  }
}
