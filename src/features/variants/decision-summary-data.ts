import { createClient } from "@/lib/supabase/server";

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
  const { data: variants, error: variantsError } = await supabase
    .from("route_variants")
    .select("id, name, color, is_primary, created_at")
    .eq("trip_id", tripId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (variantsError) return { data: null, error: variantsError.message };
  if (!variants?.length) return { data: [], error: null };

  const variantIds = variants.map(({ id }) => id);
  const [daysResult, itemsResult, plansResult] = await Promise.all([
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
        "id, trip_id, variant_id, day_id, type, title, sort_order, place_id, details, place:places(id, google_place_id, latitude, longitude)",
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
  ]);

  if (daysResult.error || itemsResult.error || plansResult.error)
    return {
      data: null,
      error:
        daysResult.error?.message ??
        itemsResult.error?.message ??
        plansResult.error?.message ??
        "The decision summary could not be loaded.",
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

  return {
    data: deriveVariantDecisionSummaryProjections({
      calculations,
      days: (daysResult.data ?? []) as DecisionSummaryDayRow[],
      items: (itemsResult.data ?? []) as DecisionSummaryItemRow[],
      legs,
      plans: (plansResult.data ?? []) as DecisionSummaryPlanRow[],
      stops,
      variants: variants as DecisionSummaryVariantRow[],
    }),
    error: null,
  };
}
