import { createClient } from "@/lib/supabase/server";
import {
  convertPlanCostBreakdown,
  knownCostFromBreakdown,
  planCostBreakdown,
  planCostSummary,
} from "@/features/research/money";
import { getExchangeRateTable } from "@/features/research/exchange-rates.server";

import { deriveVariantDecisionSummaryProjections } from "./decision-summary-projection";
import {
  decisionSummaryItemTypes,
  type DecisionSummaryCalculationRow,
  type DecisionSummaryDayRow,
  type DecisionSummaryItemRow,
  type DecisionSummaryLegRow,
  type DecisionSummaryPlanRow,
  type DecisionSummaryStopRow,
  type DecisionSummaryVariantRow,
  type VariantDecisionSummaryProjection,
} from "./decision-summary-types";

export async function getVariantDecisionSummary(
  tripId: string,
): Promise<{ data: VariantDecisionSummaryProjection[] | null; error: string | null }> {
  const supabase = await createClient();
  const [variantsResult, tripResult, exchangeRates] = await Promise.all([
    supabase
      .from("route_variants")
      .select("id, name, color, is_primary, created_at")
      .eq("trip_id", tripId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("trips").select("currency").eq("id", tripId).maybeSingle(),
    getExchangeRateTable(),
  ]);
  const { data: variants, error: variantsError } = variantsResult;

  if (variantsError || tripResult.error || !tripResult.data)
    return {
      data: null,
      error:
        variantsError?.message ??
        tripResult.error?.message ??
        "The Trip currency could not be loaded.",
    };
  if (!variants?.length) return { data: [], error: null };
  const tripCurrency = tripResult.data.currency;

  const variantIds = variants.map(({ id }) => id);
  const [daysResult, itemsResult, plansResult, pricesResult] = await Promise.all([
    supabase
      .from("trip_days")
      .select("id, variant_id, day_number, date")
      .in("variant_id", variantIds)
      .order("variant_id", { ascending: true })
      .order("day_number", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select(
        "id, trip_id, variant_id, day_id, type, title, sort_order, place_id, details, place:places(id, google_place_id, latitude, longitude, locality_name, country_code)",
      )
      .eq("trip_id", tripId)
      .in("variant_id", variantIds)
      .in("type", [...decisionSummaryItemTypes])
      .order("variant_id", { ascending: true })
      .order("day_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("day_route_plans")
      .select("id, trip_id, variant_id, day_id")
      .eq("trip_id", tripId)
      .in("variant_id", variantIds)
      .order("variant_id", { ascending: true })
      .order("day_id", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select("id, variant_id, day_id, type, title, price_amount, price_currency")
      .eq("trip_id", tripId)
      .in("variant_id", variantIds)
      .not("price_amount", "is", null),
  ]);

  if (daysResult.error || itemsResult.error || plansResult.error || pricesResult.error)
    return {
      data: null,
      error:
        daysResult.error?.message ??
        itemsResult.error?.message ??
        plansResult.error?.message ??
        pricesResult.error?.message ??
        "The comparison summary could not be loaded.",
    };

  const planIds = (plansResult.data ?? []).map(({ id }) => id);
  let stops: DecisionSummaryStopRow[] = [];
  let legs: DecisionSummaryLegRow[] = [];
  let calculations: DecisionSummaryCalculationRow[] = [];
  if (planIds.length) {
    const [stopsResult, legsResult, calculationsResult] = await Promise.all([
      supabase
        .from("day_route_stops")
        .select("id, plan_id, item_id, position")
        .in("plan_id", planIds)
        .order("plan_id", { ascending: true })
        .order("position", { ascending: true })
        .order("id", { ascending: true }),
      supabase
        .from("day_route_legs")
        .select("plan_id, position, from_stop_id, to_stop_id, mode")
        .in("plan_id", planIds)
        .order("plan_id", { ascending: true })
        .order("position", { ascending: true }),
      supabase
        .from("day_route_calculations")
        .select("plan_id, config_signature, calculated_legs")
        .in("plan_id", planIds)
        .order("plan_id", { ascending: true }),
    ]);
    if (stopsResult.error || legsResult.error || calculationsResult.error)
      return {
        data: null,
        error:
          stopsResult.error?.message ??
          legsResult.error?.message ??
          calculationsResult.error?.message ??
          "The saved Day route facts could not be loaded.",
      };
    stops = (stopsResult.data ?? []) as DecisionSummaryStopRow[];
    legs = (legsResult.data ?? []) as DecisionSummaryLegRow[];
    calculations = (calculationsResult.data ?? []) as DecisionSummaryCalculationRow[];
  }

  const dayNumbers = new Map((daysResult.data ?? []).map(({ day_number, id }) => [id, day_number]));
  const knownCostBreakdowns = Object.fromEntries(
    variantIds.map((variantId) => [
      variantId,
      planCostBreakdown(
        (pricesResult.data ?? [])
          .filter((price) => price.variant_id === variantId)
          .flatMap((price) => {
            const dayNumber = dayNumbers.get(price.day_id);
            return dayNumber === undefined ? [] : [{ ...price, dayNumber }];
          }),
      ),
    ]),
  );
  const costBreakdowns = Object.fromEntries(
    variantIds.map((variantId) => [
      variantId,
      convertPlanCostBreakdown(knownCostBreakdowns[variantId] ?? [], tripCurrency, exchangeRates),
    ]),
  );
  return {
    data: deriveVariantDecisionSummaryProjections({
      calculations,
      costBreakdowns,
      costs: Object.fromEntries(
        variantIds.map((variantId) => [
          variantId,
          planCostSummary(costBreakdowns[variantId] ?? [], tripCurrency, exchangeRates),
        ]),
      ),
      days: (daysResult.data ?? []) as DecisionSummaryDayRow[],
      items: (itemsResult.data ?? []) as DecisionSummaryItemRow[],
      legs,
      knownCosts: Object.fromEntries(
        variantIds.map((variantId) => [
          variantId,
          knownCostFromBreakdown(knownCostBreakdowns[variantId] ?? []),
        ]),
      ),
      knownCostBreakdowns,
      plans: (plansResult.data ?? []) as DecisionSummaryPlanRow[],
      stops,
      variants: variants as DecisionSummaryVariantRow[],
    }),
    error: null,
  };
}
