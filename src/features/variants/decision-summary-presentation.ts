import { format, parseISO } from "date-fns";

import { routeLegModes, type RouteLegMode } from "../routes/types.ts";
import type { VariantDecisionSummary } from "./decision-summary-types.ts";

export type DecisionSummaryMetricVisibility = {
  citySpan: boolean;
  nights: boolean;
  routeCoverage: boolean;
  routeDistanceModes: Array<{ label: string; mode: RouteLegMode }>;
  savedDayRouteModes: boolean;
  tripTransportModes: boolean;
};

export function decisionSummaryMetricVisibility(
  summaries: VariantDecisionSummary[],
): DecisionSummaryMetricVisibility {
  const routeDistanceLabels = new Map(
    summaries.flatMap(({ savedDayRouteDistanceByMode }) =>
      savedDayRouteDistanceByMode.map(({ label, mode }) => [mode, label] as const),
    ),
  );
  return {
    citySpan: summaries.some(({ citySpanMeters }) => citySpanMeters !== null),
    nights: summaries.some(({ nightCount }) => nightCount !== null),
    routeCoverage: summaries.some(({ routeCoverage }) => routeCoverage.totalSavedPlans > 0),
    routeDistanceModes: routeLegModes.flatMap((mode) => {
      const label = routeDistanceLabels.get(mode);
      return label ? [{ label, mode }] : [];
    }),
    savedDayRouteModes: summaries.some(({ savedDayRouteModes }) => savedDayRouteModes.length > 0),
    tripTransportModes: summaries.some(({ tripTransportModes }) => tripTransportModes.length > 0),
  };
}

export type NeutralDeltaKind =
  | "planning day"
  | "night"
  | "City stage"
  | "unique City place"
  | "unique planned place"
  | "City span"
  | "known Day route distance"
  | "known duration"
  | "Hotel added"
  | "Hotel changed"
  | "Hotel removed";

export function formatSummaryDistance(meters: number) {
  if (meters >= 100_000) return `${Math.round(meters / 1_000).toLocaleString()} km`;
  if (meters >= 1_000) return `${(meters / 1_000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatSummaryDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`;
}

export function formatKnownDuration(seconds: number | null, unknownLegs: number) {
  if (seconds === null) return "Not calculated";
  if (seconds === 0 && unknownLegs)
    return (
      "No known duration · " + unknownLegs + " " + (unknownLegs === 1 ? "leg" : "legs") + " unknown"
    );
  return unknownLegs
    ? `${formatSummaryDuration(seconds)} known · ${unknownLegs} ${unknownLegs === 1 ? "leg" : "legs"} unknown`
    : formatSummaryDuration(seconds);
}

export function formatHotelAlignmentLabel(label: string) {
  return label.startsWith("Day ") ? label : format(parseISO(label), "MMM d, yyyy");
}

function metricValue(kind: NeutralDeltaKind, value: number) {
  if (kind === "City span" || kind === "known Day route distance")
    return formatSummaryDistance(Math.abs(value));
  if (kind === "known duration") return formatSummaryDuration(Math.abs(value));
  return Math.abs(value).toLocaleString();
}

function pluralMetric(kind: NeutralDeltaKind, value: number) {
  if (Math.abs(value) === 1 || kind.includes("distance") || kind === "City span") return kind;
  if (kind === "Hotel added" || kind === "Hotel changed" || kind === "Hotel removed")
    return `${kind} occurrences`;
  return `${kind}s`;
}

export function neutralDeltaLabel(kind: NeutralDeltaKind, value: number) {
  if (kind === "Hotel added" || kind === "Hotel changed" || kind === "Hotel removed") {
    const action = kind.slice(6).toLowerCase();
    return value === 0 ? "0 " + action + " vs Primary" : value + " " + action + " vs Primary";
  }
  if (value === 0) return `Same ${kind} as Primary`;
  return `${value > 0 ? "+" : "−"}${metricValue(kind, value)} vs Primary`;
}

export function neutralDeltaAccessibleLabel(kind: NeutralDeltaKind, value: number) {
  if (kind === "Hotel added" || kind === "Hotel changed" || kind === "Hotel removed") {
    const action = kind.slice(6).toLowerCase();
    return (
      Math.abs(value) +
      " Hotel " +
      (Math.abs(value) === 1 ? "occurrence" : "occurrences") +
      " " +
      action +
      " versus Primary"
    );
  }
  if (value === 0) return `Same ${kind} as Primary`;
  const direction = value > 0 ? "additional" : "fewer";
  if (kind === "City span" || kind === "known Day route distance" || kind === "known duration")
    return `${metricValue(kind, value)} ${value > 0 ? "greater" : "less"} ${kind} versus Primary`;
  return `${metricValue(kind, value)} ${direction} ${pluralMetric(kind, value)} versus Primary`;
}
