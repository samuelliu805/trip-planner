import type { Coordinates } from "@/lib/providers/maps/types";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import type { Tables } from "@/types/database";

export const routeLegModes = [
  "walk",
  "self_driving",
  "taxi",
  "rideshare",
  "bus",
  "subway",
  "tram",
  "shuttle",
  "train",
  "bike",
  "flight",
  "ferry",
  "cable_car",
  "motorcycle",
  "other",
] as const;

export type RouteLegMode = (typeof routeLegModes)[number];

export const overviewRouteModes = ["self_driving", "flight", "train", "bus", "bike"] as const;
export type OverviewRouteMode = (typeof overviewRouteModes)[number];

export const eligibleRouteStopTypes = ["activity", "meal", "hotel"] as const;
export type EligibleRouteStopType = (typeof eligibleRouteStopTypes)[number];

export type RouteStopCandidate = {
  coordinates: Coordinates | null;
  dayId: string;
  itemId: string;
  tripId: string;
  type: string;
  variantId: string;
};

export type DayRouteDraft = {
  dayId: string;
  legModes: RouteLegMode[];
  stops: RouteStopCandidate[];
  tripId: string;
  variantId: string;
};

export type DayRouteStop = Tables<"day_route_stops">;
export type DayRouteLeg = Omit<Tables<"day_route_legs">, "mode"> & { mode: RouteLegMode };
export type DayRouteCalculation = Omit<Tables<"day_route_calculations">, "calculated_legs"> & {
  calculatedLegs: CalculatedRouteLeg[];
};
export type DayRoutePlan = Tables<"day_route_plans"> & {
  calculation: DayRouteCalculation | null;
  calculationState?: "updating";
  legs: DayRouteLeg[];
  stops: DayRouteStop[];
};

export type RouteCalculationConfig = {
  dayId: string;
  legModes: RouteLegMode[];
  stops: Array<{ coordinates: Coordinates; itemId: string }>;
  tripId: string;
  variantId: string;
};

export type SaveDayRoutePlanInput = {
  dayId: string;
  itemIds: string[];
  legModes: RouteLegMode[];
  tripId: string;
  variantId: string;
};

export type CalculateDayRouteInput = { planId: string; tripId: string };
export type CalculateOverviewRouteInput = {
  legs: Array<{ mode: OverviewRouteMode; position: number }>;
  tripId: string;
};
export type ClearDayRouteInput = { dayId: string; tripId: string; variantId: string };

export type RouteActionResult<T> =
  | { cache?: "full" | "partial" | "miss"; data: T; error?: never }
  | { cache?: never; data?: never; error: string };
