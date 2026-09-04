import type { ItineraryItem } from "../itinerary/types.ts";
import { haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";

import { isRouteLegMode } from "./route-config.ts";
import { canonicalRouteLegMode, type RouteLegMode } from "./types.ts";

type Point = { latitude: number; longitude: number };

const modeTier: Record<RouteLegMode, number> = {
  walk: 0,
  bike: 1,
  bus: 2,
  cable_car: 2,
  motorcycle: 2,
  other: 2,
  rideshare: 2,
  self_driving: 2,
  shuttle: 2,
  subway: 2,
  taxi: 2,
  tram: 2,
  ferry: 3,
  train: 3,
  flight: 4,
};

function point(value: unknown): Point | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { latitude, longitude } = value as Record<string, unknown>;
  return typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    typeof longitude === "number" &&
    Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function routeSpanMeters(items: ItineraryItem[]) {
  const points = items.flatMap((item) => {
    const details = item.details as Record<string, unknown>;
    return [point(item.place), point(details.originPlace), point(details.destinationPlace)].filter(
      (candidate): candidate is Point => Boolean(candidate),
    );
  });
  let span = 0;
  for (let from = 0; from < points.length; from += 1)
    for (let to = from + 1; to < points.length; to += 1)
      span = Math.max(span, haversineDistanceMeters(points[from], points[to]));
  return points.length >= 2 ? span : null;
}

function preferredTier(distanceMeters: number) {
  if (distanceMeters < 1_500) return 0;
  if (distanceMeters < 6_000) return 1;
  if (distanceMeters < 30_000) return 2;
  if (distanceMeters <= 800_000) return 3;
  return 4;
}

export function suggestedDraftLegMode(items: ItineraryItem[]): RouteLegMode {
  const modes: RouteLegMode[] = [];
  for (const item of items) {
    const value =
      item.type === "flight" || item.type === "train"
        ? item.type
        : item.type === "transport"
          ? (item.details as Record<string, unknown>).mode
          : null;
    if (typeof value !== "string" || !isRouteLegMode(value)) continue;
    const canonical = canonicalRouteLegMode(value);
    if (!modes.includes(canonical)) modes.push(canonical);
  }
  if (!modes.length || modes.includes("self_driving")) return "self_driving";
  if (modes.length === 1) return modes[0];
  const span = routeSpanMeters(items);
  if (span === null) return modes[0];
  const tier = preferredTier(span);
  return modes.reduce((best, candidate) =>
    Math.abs(modeTier[candidate] - tier) < Math.abs(modeTier[best] - tier) ? candidate : best,
  );
}
