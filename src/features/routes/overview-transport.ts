import type { ItineraryItem, PlannerDay } from "../itinerary/types.ts";
import { haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";

import { isOverviewRouteLeg, type OverviewStage } from "./overview.ts";
import type { OverviewRouteMode } from "./types.ts";

export const overviewFlightThresholdMeters = 500_000;

export const overviewRouteModeLabels: Record<OverviewRouteMode, string> = {
  bike: "Bike",
  bus: "Bus",
  flight: "Flight",
  self_driving: "Drive",
  train: "Train",
};

const priority: OverviewRouteMode[] = ["flight", "self_driving", "train", "bus", "bike"];

function overviewModeForItem(item: ItineraryItem): OverviewRouteMode | null {
  const details = item.details as Record<string, unknown>;
  const rawMode =
    item.type === "flight"
      ? "flight"
      : item.type === "train"
        ? "train"
        : typeof details.mode === "string"
          ? details.mode
          : "";
  if (rawMode === "flight") return "flight";
  if (["self_driving", "rental_car", "taxi", "rideshare"].includes(rawMode)) return "self_driving";
  if (["train", "subway", "tram", "metro", "light_rail"].includes(rawMode)) return "train";
  if (["bus", "coach", "shuttle"].includes(rawMode)) return "bus";
  if (rawMode === "bike") return "bike";
  return null;
}

function explicitModeForArrivalDay(day?: PlannerDay): OverviewRouteMode | undefined {
  if (!day) return undefined;
  const available = new Set(
    day.items
      .filter(({ type }) => ["transport", "flight", "train"].includes(type))
      .map(overviewModeForItem)
      .filter((mode): mode is OverviewRouteMode => mode !== null),
  );
  return priority.find((mode) => available.has(mode));
}

export function deriveOverviewDefaultModes(
  days: PlannerDay[],
  stages: OverviewStage[],
): Array<OverviewRouteMode | undefined> {
  const daysByNumber = new Map(days.map((day) => [day.day_number, day]));
  return stages.slice(1).map((destination, index) => {
    const origin = stages[index];
    if (!isOverviewRouteLeg(origin, destination)) return undefined;
    const arrivalDayNumber = Math.min(...destination.entries.map(({ dayNumber }) => dayNumber));
    const explicit = explicitModeForArrivalDay(daysByNumber.get(arrivalDayNumber));
    if (explicit) return explicit;
    const distance = haversineDistanceMeters(
      { latitude: origin.latitude, longitude: origin.longitude },
      { latitude: destination.latitude, longitude: destination.longitude },
    );
    return distance >= overviewFlightThresholdMeters ? "flight" : "self_driving";
  });
}
