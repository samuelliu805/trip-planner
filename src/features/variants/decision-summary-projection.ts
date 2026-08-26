import { deriveCityMetrics, derivePlanningHorizon } from "./decision-summary-city-metrics.ts";
import { deriveHotelOccurrences } from "./decision-summary-hotel-metrics.ts";
import { sortedDecisionSummaryDays } from "./decision-summary-normalization.ts";
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
      return {
        ...deriveCityMetrics(variant.id, days, itemsGroupedByDay(items)),
        ...derivePlanningHorizon(days),
        ...deriveRouteMetrics(input, variant.id, days, items),
        color: variant.color,
        cost: input.costs?.[variant.id] ?? {
          amount:
            input.knownCosts[variant.id]?.length === 1
              ? input.knownCosts[variant.id][0].amount
              : null,
          complete: (input.knownCosts[variant.id]?.length ?? 0) <= 1,
          converted: false,
          currency: input.knownCosts[variant.id]?.[0]?.currency ?? "USD",
          itemCount: input.knownCostBreakdowns[variant.id]?.length ?? 0,
          rateDate: null,
          unavailableCurrencies:
            (input.knownCosts[variant.id]?.length ?? 0) > 1
              ? input.knownCosts[variant.id].map(({ currency }) => currency)
              : [],
        },
        costBreakdown:
          input.costBreakdowns?.[variant.id] ??
          (input.knownCostBreakdowns[variant.id] ?? []).map((line) => ({
            ...line,
            convertedAmount: line.amount,
            convertedCurrency: line.currency,
          })),
        dayDates: days.map(({ date, day_number }) => ({ date, dayNumber: day_number })),
        hotelOccurrences: deriveHotelOccurrences(items, days),
        isPrimary: variant.is_primary,
        knownCost: input.knownCosts[variant.id] ?? [],
        knownCostBreakdown: input.knownCostBreakdowns[variant.id] ?? [],
        name: variant.name,
        plannedPlaceOccurrenceCount: placeLinked.length,
        uniquePlannedPlaces: new Set(placeLinked.map(({ place_id }) => place_id)).size,
        variantId: variant.id,
      };
    });
}
