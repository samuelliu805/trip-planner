import { transportModeLabels } from "../itinerary/types.ts";
import { isRouteLegMode } from "../routes/route-config.ts";
import { parseCalculatedRouteLegs } from "../routes/results.ts";
import { dayRouteStatusFromProjection } from "../routes/status.ts";
import { canonicalRouteLegMode, routeLegModes, type RouteLegMode } from "../routes/types.ts";

import { validDecisionSummaryCoordinates } from "./decision-summary-normalization.ts";
import type {
  DecisionSummaryCalculatedPlan,
  DecisionSummaryDayRow,
  DecisionSummaryInput,
  DecisionSummaryItemRow,
  DecisionSummaryRouteCoverage,
} from "./decision-summary-types.ts";

function emptyRouteCoverage(): DecisionSummaryRouteCoverage {
  return {
    current: 0,
    currentCalculatedLegCount: 0,
    fallbackLegCount: 0,
    needs_edit: 0,
    noRouteFallbackCount: 0,
    stale: 0,
    totalSavedPlans: 0,
    uncalculated: 0,
    unsupportedModeFallbackCount: 0,
    updating: 0,
  };
}

function plansForVariant(
  input: DecisionSummaryInput,
  variantId: string,
  days: DecisionSummaryDayRow[],
  items: DecisionSummaryItemRow[],
) {
  const planRows = input.plans
    .filter((plan) => plan.variant_id === variantId)
    .sort((a, b) => a.day_id.localeCompare(b.day_id) || a.id.localeCompare(b.id));
  const projection = {
    days: days.map((day) => ({ dayNumber: day.day_number, id: day.id })),
    items: items.map((item) => ({
      coordinates:
        item.place_id === item.place?.id && validDecisionSummaryCoordinates(item.place)
          ? { latitude: item.place.latitude!, longitude: item.place.longitude! }
          : null,
      dayId: item.day_id,
      itemId: item.id,
      tripId: item.trip_id,
      type: item.type,
      variantId: item.variant_id,
    })),
  };
  return planRows.map((plan) => {
    const legs = input.legs
      .filter(
        (leg): leg is typeof leg & { mode: RouteLegMode } =>
          leg.plan_id === plan.id && isRouteLegMode(leg.mode),
      )
      .sort((a, b) => a.position - b.position)
      .map(({ from_stop_id, mode, position, to_stop_id }) => ({
        from_stop_id,
        mode,
        position,
        to_stop_id,
      }));
    const stops = input.stops
      .filter((stop) => stop.plan_id === plan.id)
      .sort((a, b) => a.position - b.position);
    const calculationRow = input.calculations.find(({ plan_id }) => plan_id === plan.id);
    const calculatedLegs = calculationRow
      ? parseCalculatedRouteLegs(calculationRow.calculated_legs)
      : null;
    const normalized: DecisionSummaryCalculatedPlan = {
      calculation:
        calculationRow && calculatedLegs
          ? { calculatedLegs, config_signature: calculationRow.config_signature }
          : null,
      day_id: plan.day_id,
      legs,
      stops,
      trip_id: plan.trip_id,
      variant_id: plan.variant_id,
    };
    return { plan: normalized, projection };
  });
}

export function deriveRouteMetrics(
  input: DecisionSummaryInput,
  variantId: string,
  days: DecisionSummaryDayRow[],
  items: DecisionSummaryItemRow[],
) {
  const coverage = emptyRouteCoverage();
  let knownDistance = 0;
  let knownDuration = 0;
  let hasCurrentLeg = false;
  let unknownDurationLegCount = 0;
  const distanceByMode = new Map<RouteLegMode, number>();
  for (const { plan, projection } of plansForVariant(input, variantId, days, items)) {
    const status = dayRouteStatusFromProjection(projection, plan);
    coverage[status] += 1;
    coverage.totalSavedPlans += 1;
    if (status !== "current" || !plan.calculation) continue;
    const modeByPosition = new Map(plan.legs.map(({ mode, position }) => [position, mode]));
    coverage.currentCalculatedLegCount += plan.calculation.calculatedLegs.length;
    for (const leg of plan.calculation.calculatedLegs) {
      if (leg.geometry.source === "straight") coverage.fallbackLegCount += 1;
      if (leg.fallbackReason === "no_route") coverage.noRouteFallbackCount += 1;
      if (leg.fallbackReason === "unsupported_mode") coverage.unsupportedModeFallbackCount += 1;
      if (leg.geometry.source === "straight" || leg.fallbackReason) continue;
      hasCurrentLeg = true;
      knownDistance += leg.distanceMeters;
      const persistedMode = modeByPosition.get(leg.position);
      const savedMode = persistedMode ? canonicalRouteLegMode(persistedMode) : undefined;
      if (savedMode)
        distanceByMode.set(savedMode, (distanceByMode.get(savedMode) ?? 0) + leg.distanceMeters);
      if (leg.durationSeconds === null) unknownDurationLegCount += 1;
      else knownDuration += leg.durationSeconds;
    }
  }
  return {
    knownDayRouteDistanceMeters: hasCurrentLeg ? knownDistance : null,
    knownDurationSeconds: hasCurrentLeg ? knownDuration : null,
    routeCoverage: coverage,
    savedDayRouteDistanceByMode: routeLegModes.flatMap((mode) => {
      const distanceMeters = distanceByMode.get(mode);
      return distanceMeters === undefined
        ? []
        : [{ distanceMeters, label: transportModeLabels[mode], mode }];
    }),
    unknownDurationLegCount,
  };
}
