import type { PlannerVariant } from "../itinerary/types.ts";
import { transportModeLabels } from "../itinerary/types.ts";
import { routeLegModes } from "../routes/types.ts";

import { compareHotelOccurrences } from "./decision-summary-hotel-metrics.ts";
import type {
  VariantDecisionSummary,
  VariantDecisionSummaryProjection,
} from "./decision-summary-types.ts";

export function reconcileDecisionSummaryProjections(
  variants: PlannerVariant[],
  projections: VariantDecisionSummaryProjection[] | undefined,
) {
  const byId = new Map(projections?.map((projection) => [projection.variantId, projection]));
  return variants.flatMap((variant) => {
    const projection = byId.get(variant.id);
    return projection
      ? [
          {
            ...projection,
            color: variant.color,
            isPrimary: variant.is_primary,
            name: variant.name,
          },
        ]
      : [];
  });
}

function routeDistanceDeltas(
  primary: VariantDecisionSummaryProjection,
  compared: VariantDecisionSummaryProjection,
) {
  if (primary.knownDayRouteDistanceMeters === null || compared.knownDayRouteDistanceMeters === null)
    return null;
  const primaryByMode = new Map(
    primary.savedDayRouteDistanceByMode.map(({ distanceMeters, mode }) => [mode, distanceMeters]),
  );
  const comparedByMode = new Map(
    compared.savedDayRouteDistanceByMode.map(({ distanceMeters, mode }) => [mode, distanceMeters]),
  );
  return routeLegModes.flatMap((mode) =>
    primaryByMode.has(mode) || comparedByMode.has(mode)
      ? [
          {
            distanceMeters: (comparedByMode.get(mode) ?? 0) - (primaryByMode.get(mode) ?? 0),
            label: transportModeLabels[mode],
            mode,
          },
        ]
      : [],
  );
}

function decisionSummaryDeltas(
  primary: VariantDecisionSummaryProjection,
  compared: VariantDecisionSummaryProjection,
) {
  const hotelDifference = compareHotelOccurrences(primary, compared);
  return {
    deltas: {
      citySpanMeters:
        compared.citySpanMeters === null || primary.citySpanMeters === null
          ? null
          : compared.citySpanMeters - primary.citySpanMeters,
      cityStages: compared.cityStageCount - primary.cityStageCount,
      dayRouteDistanceByMode: routeDistanceDeltas(primary, compared),
      days: compared.dayCount - primary.dayCount,
      hotelAdded: hotelDifference.added,
      hotelChanged: hotelDifference.changed,
      hotelRemoved: hotelDifference.removed,
      knownDayRouteDistanceMeters:
        compared.knownDayRouteDistanceMeters === null ||
        primary.knownDayRouteDistanceMeters === null
          ? null
          : compared.knownDayRouteDistanceMeters - primary.knownDayRouteDistanceMeters,
      knownDurationSeconds:
        compared.knownDurationSeconds === null ||
        primary.knownDurationSeconds === null ||
        compared.unknownDurationLegCount > 0 ||
        primary.unknownDurationLegCount > 0
          ? null
          : compared.knownDurationSeconds - primary.knownDurationSeconds,
      nights:
        compared.nightCount === null || primary.nightCount === null
          ? null
          : compared.nightCount - primary.nightCount,
      uniqueCityPlaces: compared.uniqueCityPlaceCount - primary.uniqueCityPlaceCount,
      uniquePlannedPlaces: compared.uniquePlannedPlaces - primary.uniquePlannedPlaces,
    },
    hotelDifference,
  };
}

export function finalizeVariantDecisionSummaries(
  projections: VariantDecisionSummaryProjection[],
): VariantDecisionSummary[] {
  const primary = projections.find(({ isPrimary }) => isPrimary);
  if (!primary)
    return projections.map((projection) => ({
      ...projection,
      deltas: null,
      hotelDifference: null,
    }));
  return projections.map((projection) =>
    projection.variantId === primary.variantId
      ? { ...projection, deltas: null, hotelDifference: null }
      : { ...projection, ...decisionSummaryDeltas(primary, projection) },
  );
}
