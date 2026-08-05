import { haversineDistanceMeters } from "../../lib/providers/routes/geo.ts";
import { isOverviewRouteLeg } from "../routes/overview.ts";

import { deriveComparisonStages } from "./comparison-presentation.ts";
import type { VariantComparisonProjection } from "./comparison-types.ts";
import {
  decisionSummaryPlaceKey,
  sortedDecisionSummaryDays,
  sortedDecisionSummaryItems,
  validDecisionSummaryCoordinates,
} from "./decision-summary-normalization.ts";
import type { DecisionSummaryDayRow, DecisionSummaryItemRow } from "./decision-summary-types.ts";

export function derivePlanningHorizon(days: DecisionSummaryDayRow[]) {
  const ordered = sortedDecisionSummaryDays(days);
  if (!ordered.length || ordered.some(({ date }) => !date)) {
    return {
      dayCount: ordered.length,
      nightCount: null,
      nightUnknownReason: "Dates incomplete" as const,
    };
  }
  const dates = ordered.map(({ date }) => Date.parse(`${date}T00:00:00Z`));
  const continuous = dates.every(
    (date, index) => index === 0 || date - dates[index - 1] === 86_400_000,
  );
  return {
    dayCount: ordered.length,
    nightCount: continuous ? Math.max(0, ordered.length - 1) : null,
    nightUnknownReason: continuous ? null : ("Dates not continuous" as const),
  };
}

function cityComparisonProjection(
  variantId: string,
  days: DecisionSummaryDayRow[],
  itemsByDay: Map<string, DecisionSummaryItemRow[]>,
): VariantComparisonProjection {
  return {
    color: "#000000",
    days: sortedDecisionSummaryDays(days).map((day) => ({
      cities: sortedDecisionSummaryItems(itemsByDay.get(day.id) ?? []).flatMap((item) => {
        const key = item.type === "location" ? decisionSummaryPlaceKey(item) : null;
        if (!key || !validDecisionSummaryCoordinates(item.place)) return [];
        return [
          {
            itemId: item.id,
            latitude: item.place!.latitude!,
            longitude: item.place!.longitude!,
            placeId: item.place_id!,
            placeKey: key,
            sortOrder: item.sort_order,
            title: item.title,
          },
        ];
      }),
      date: day.date,
      dayNumber: day.day_number,
      id: day.id,
    })),
    isPrimary: false,
    name: "",
    variantId,
  };
}

function citySequenceIdentity(item: DecisionSummaryItemRow) {
  return decisionSummaryPlaceKey(item) ?? `title:${item.title.trim().toLowerCase()}`;
}

export function deriveCityMetrics(
  variantId: string,
  days: DecisionSummaryDayRow[],
  itemsByDay: Map<string, DecisionSummaryItemRow[]>,
) {
  const cityItems = sortedDecisionSummaryDays(days).flatMap((day) =>
    sortedDecisionSummaryItems(itemsByDay.get(day.id) ?? []).filter(
      ({ type }) => type === "location",
    ),
  );
  const stages = deriveComparisonStages(cityComparisonProjection(variantId, days, itemsByDay));
  const citySpanMeters =
    stages.length < 2
      ? null
      : stages.slice(1).reduce((total, stage, index) => {
          const previous = stages[index];
          return isOverviewRouteLeg(previous, stage)
            ? total +
                haversineDistanceMeters(
                  { latitude: previous.latitude, longitude: previous.longitude },
                  { latitude: stage.latitude, longitude: stage.longitude },
                )
            : total;
        }, 0);
  return {
    citySequence: cityItems.flatMap((item, index) =>
      index > 0 && citySequenceIdentity(cityItems[index - 1]) === citySequenceIdentity(item)
        ? []
        : [item.title],
    ),
    citySpanMeters,
    cityStageCount: cityItems.length,
    uniqueCityPlaceCount: new Set(cityItems.map(decisionSummaryPlaceKey).filter(Boolean)).size,
  };
}
