import type { Trip, TripStatus } from "../contracts/trips.ts";
import { PlatformOperationError } from "../contracts/errors.ts";
import { normalizeTrips } from "../trips/normalization.ts";
import type { CloudBaseDatabase } from "./client.ts";
import { cloudBaseData } from "./errors.ts";

function oneUpdatedTrip(value: unknown): Trip | null {
  const trips = normalizeTrips(value);
  if (trips.length > 1) {
    throw new PlatformOperationError("unexpected", "The trip update returned duplicate rows.");
  }
  return trips[0] ?? null;
}

export async function setCloudBaseTripStatus(
  db: CloudBaseDatabase,
  userId: string,
  id: string,
  status: TripStatus,
) {
  const result = await db
    .from("trips")
    .update({ status })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("*");
  const trip = oneUpdatedTrip(cloudBaseData(result, "The trip status could not be updated."));
  if (!trip) {
    throw new PlatformOperationError(
      "forbidden",
      "You do not have permission to update this trip.",
    );
  }
  if (trip.id !== id || trip.owner_id !== userId || trip.status !== status) {
    throw new PlatformOperationError("unexpected", "The trip status update was not confirmed.");
  }
  return trip;
}

export async function renameCloudBaseTripIfTitle(
  db: CloudBaseDatabase,
  userId: string,
  id: string,
  currentTitle: string,
  nextTitle: string,
) {
  const result = await db
    .from("trips")
    .update({ title: nextTitle })
    .eq("id", id)
    .eq("owner_id", userId)
    .eq("title", currentTitle)
    .select("id");
  const rows = cloudBaseData(result, "The trip title could not be updated.");
  if (!Array.isArray(rows)) {
    throw new PlatformOperationError("unexpected", "The trip title update returned invalid data.");
  }
  if (rows.length > 1) {
    throw new PlatformOperationError(
      "unexpected",
      "The trip title update returned duplicate rows.",
    );
  }
  if (!rows.length) return false;
  const updatedId = (rows[0] as Record<string, unknown>).id;
  if (updatedId !== id) {
    throw new PlatformOperationError("unexpected", "The trip title update was not confirmed.");
  }
  return true;
}

export async function removeCloudBaseTrip(db: CloudBaseDatabase, userId: string, id: string) {
  const result = await db.from("trips").delete().eq("id", id).eq("owner_id", userId).select("id");
  const rows = cloudBaseData(result, "The trip could not be removed.");
  if (!Array.isArray(rows) || rows.length > 1) {
    throw new PlatformOperationError("unexpected", "The trip deletion returned invalid data.");
  }
  if (!rows.length) throw new PlatformOperationError("not_found", "The trip was not found.");
  if ((rows[0] as Record<string, unknown>).id !== id) {
    throw new PlatformOperationError("unexpected", "The trip deletion was not confirmed.");
  }
}
