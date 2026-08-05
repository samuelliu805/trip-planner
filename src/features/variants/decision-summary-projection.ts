import type { TransportMode } from "../itinerary/types.ts";
import { transportModeLabels, transportModes } from "../itinerary/types.ts";

import { deriveCityMetrics, derivePlanningHorizon } from "./decision-summary-city-metrics.ts";
import { deriveHotelOccurrences } from "./decision-summary-hotel-metrics.ts";
import {
  countedDecisionSummaryModes,
  explicitDecisionSummaryTransportMode,
  sortedDecisionSummaryDays,
} from "./decision-summary-normalization.ts";
import { deriveRouteMetrics } from "./decision-summary-route-metrics.ts";
import type {
  DecisionSummaryInput,
  DecisionSummaryItemRow,
  VariantDecisionSummaryProjection,
} from "./decision-summary-types.ts";

const plannedPlaceTypes = new Set(["location", "activity", "meal", "hotel", "car_rental"]);

function validProjectionItems(input: DecisionSummaryInput, variantIds: Set<string>) {
  const dayVariant = new Map(
    input.days
      .filter(({ variant_id }) => variantIds.has(variant_id))
      .map(({ id, variant_id }) => [id, variant_id]),
  );
  return input.items.filter(
    (item) => variantIds.has(item.variant_id) && dayVariant.get(item.day_id) === item.variant_id,
  );
}

function itemsGroupedByDay(items: DecisionSummaryItemRow[]) {
  const itemsByDay = new Map<string, DecisionSummaryItemRow[]>();
  for (const item of items) {
    const dayItems = itemsByDay.get(item.day_id) ?? [];
    dayItems.push(item);
    itemsByDay.set(item.day_id, dayItems);
  }
  return itemsByDay;
}

export function deriveVariantDecisionSummaryProjections(
  input: DecisionSummaryInput,
): VariantDecisionSummaryProjection[] {
  const variantIds = new Set(input.variants.map(({ id }) => id));
  const validItems = validProjectionItems(input, variantIds);
  return [...input.variants]
    .sort(
      (a, b) =>
        Number(b.is_primary) - Number(a.is_primary) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id),
    )
    .map((variant) => {
      const days = sortedDecisionSummaryDays(
        input.days.filter(({ variant_id }) => variant_id === variant.id),
      );
      const items = validItems.filter(({ variant_id }) => variant_id === variant.id);
      const placeLinked = items.filter(
        ({ place_id, type }) => Boolean(place_id) && plannedPlaceTypes.has(type),
      );
      const tripModes = items
        .filter(({ type }) => ["transport", "flight", "train"].includes(type))
        .map(explicitDecisionSummaryTransportMode)
        .filter((mode): mode is TransportMode => mode !== null);
      return {
        ...deriveCityMetrics(variant.id, days, itemsGroupedByDay(items)),
        ...derivePlanningHorizon(days),
        ...deriveRouteMetrics(input, variant.id, days, items),
        color: variant.color,
        dayDates: days.map(({ date, day_number }) => ({ date, dayNumber: day_number })),
        hotelOccurrences: deriveHotelOccurrences(items, days),
        isPrimary: variant.is_primary,
        name: variant.name,
        plannedPlaceOccurrenceCount: placeLinked.length,
        tripTransportModes: countedDecisionSummaryModes(
          tripModes,
          transportModes,
          (mode) => transportModeLabels[mode],
        ),
        uniquePlannedPlaces: new Set(placeLinked.map(({ place_id }) => place_id)).size,
        variantId: variant.id,
      };
    });
}
