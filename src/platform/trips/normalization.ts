import { PlatformOperationError } from "../contracts/errors.ts";
import type { Trip } from "../contracts/trips.ts";

function record(value: unknown, label: string): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  throw new PlatformOperationError("unexpected", `${label} returned an invalid record.`);
}

function string(row: Record<string, unknown>, key: string) {
  if (typeof row[key] === "string") return row[key];
  throw new PlatformOperationError("unexpected", `Trip data is missing ${key}.`);
}

function nullableString(row: Record<string, unknown>, key: string) {
  if (row[key] === null) return null;
  return string(row, key);
}

function routeVariant(value: unknown) {
  const row = record(value, "Route variant query");
  return Object.freeze({
    color: string(row, "color"),
    id: string(row, "id"),
    is_primary: row.is_primary === true,
    name: string(row, "name"),
  });
}

export function normalizeTrip(value: unknown): Trip {
  const row = record(value, "Trip query");
  if (typeof row.day_count !== "number") {
    throw new PlatformOperationError("unexpected", "Trip data is missing day_count.");
  }
  const variants = Array.isArray(row.route_variants)
    ? Object.freeze(row.route_variants.map(routeVariant))
    : undefined;
  return Object.freeze({
    created_at: string(row, "created_at"),
    currency: string(row, "currency"),
    day_count: row.day_count,
    end_date: nullableString(row, "end_date"),
    id: string(row, "id"),
    owner_id: string(row, "owner_id"),
    ...(variants ? { route_variants: variants } : {}),
    start_date: nullableString(row, "start_date"),
    status: string(row, "status"),
    timezone: string(row, "timezone"),
    title: string(row, "title"),
    updated_at: string(row, "updated_at"),
  });
}

export function normalizeTrips(value: unknown) {
  if (!Array.isArray(value)) {
    throw new PlatformOperationError("unexpected", "Trip query returned an invalid result.");
  }
  return value.map(normalizeTrip);
}

export function normalizeRouteVariants(value: unknown) {
  if (!Array.isArray(value)) {
    throw new PlatformOperationError(
      "unexpected",
      "Route variant query returned an invalid result.",
    );
  }
  return value.map(routeVariant);
}
