import { routeLegModes, type RouteLegMode } from "../routes/types.ts";
import type { VariantDecisionSummary } from "./decision-summary-types.ts";

export type DecisionSummaryMetricVisibility = {
  routeDistanceModes: Array<{ label: string; mode: RouteLegMode }>;
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
    routeDistanceModes: routeLegModes.flatMap((mode) => {
      const label = routeDistanceLabels.get(mode);
      return label ? [{ label, mode }] : [];
    }),
  };
}

export function formatSummaryDistance(meters: number) {
  if (meters >= 100_000) return `${Math.round(meters / 1_000).toLocaleString()} km`;
  if (meters >= 1_000) return `${(meters / 1_000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}
