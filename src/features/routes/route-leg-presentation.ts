import { transportModeLabels } from "../itinerary/types.ts";
import type { RouteLegMode } from "./types.ts";

export type RouteLegDetail = {
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  estimateKind?: "transit_current_service";
  fallbackReason?: "unsupported_mode" | "no_route";
  fromLabel?: string;
  geometry?: { source: "google" | "straight" };
  mode: RouteLegMode;
  position: number;
  toLabel?: string;
};

export function routeLegExplanation(leg: RouteLegDetail) {
  if (leg.geometry?.source === "straight" || leg.fallbackReason) {
    return leg.fallbackReason === "unsupported_mode"
      ? `${transportModeLabels[leg.mode]} unavailable · direct map line`
      : "Route unavailable · direct map line";
  }
  if (leg.estimateKind === "transit_current_service")
    return "Transit directions · current-service estimate";
  if (["self_driving", "taxi", "rideshare", "motorcycle"].includes(leg.mode))
    return "Driving directions";
  if (leg.mode === "walk") return "Walking directions";
  if (leg.mode === "bike") return "Cycling directions";
  if (["bus", "subway", "tram", "shuttle", "train", "cable_car"].includes(leg.mode))
    return "Transit directions";
  if (leg.mode === "flight") return "Flight connection";
  if (leg.mode === "ferry") return "Ferry connection";
  return `${transportModeLabels[leg.mode]} route`;
}
