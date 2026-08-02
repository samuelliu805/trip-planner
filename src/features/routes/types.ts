import type { Coordinates } from "@/lib/providers/maps/types";

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
