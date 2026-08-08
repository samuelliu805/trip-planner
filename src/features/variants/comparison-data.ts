import { createClient } from "@/lib/supabase/server";

import {
  attachVariantComparisonDayRoutes,
  normalizeVariantComparisonProjection,
} from "./comparison-normalization";
import type {
  ComparisonCityRow,
  ComparisonDayRow,
  ComparisonRouteCalculationRow,
  ComparisonRoutePlanRow,
  ComparisonRouteStopRow,
  ComparisonVariantRow,
  VariantComparisonProjection,
} from "./comparison-types";

export async function getVariantComparison(
  tripId: string,
  dayNumber?: number,
): Promise<{ data: VariantComparisonProjection[] | null; error: string | null }> {
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
  const [daysResult, activitiesResult] = await Promise.all([
    supabase
      .from("trip_days")
      .select("id, variant_id, day_number, date")
      .in("variant_id", variantIds)
      .order("day_number", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select(
        "id, variant_id, day_id, type, title, sort_order, place_id, place:places(id, google_place_id, formatted_address, latitude, longitude, locality_name, country_code)",
      )
      .eq("trip_id", tripId)
      .in("variant_id", variantIds)
      .in("type", ["location", "activity", "meal", "hotel"])
      .order("day_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (daysResult.error || activitiesResult.error)
    return {
      data: null,
      error:
        daysResult.error?.message ??
        activitiesResult.error?.message ??
        "The route comparison could not be loaded.",
    };

  const days = (daysResult.data ?? []) as ComparisonDayRow[];
  const activities = (activitiesResult.data ?? []) as ComparisonCityRow[];
  const projections = normalizeVariantComparisonProjection(
    variants as ComparisonVariantRow[],
    days,
    activities,
  );
  if (dayNumber === undefined) return { data: projections, error: null };

  const dayIds = days.filter(({ day_number }) => day_number === dayNumber).map(({ id }) => id);
  if (!dayIds.length) return { data: projections, error: null };
  const plansResult = await supabase
    .from("day_route_plans")
    .select("id, variant_id, day_id")
    .eq("trip_id", tripId)
    .in("variant_id", variantIds)
    .in("day_id", dayIds);
  if (plansResult.error) return { data: null, error: plansResult.error.message };

  const plans = (plansResult.data ?? []) as ComparisonRoutePlanRow[];
  const planIds = plans.map(({ id }) => id);
  let stops: ComparisonRouteStopRow[] = [];
  let calculations: ComparisonRouteCalculationRow[] = [];
  if (planIds.length) {
    const [stopsResult, calculationsResult] = await Promise.all([
      supabase
        .from("day_route_stops")
        .select("plan_id, item_id, position")
        .in("plan_id", planIds)
        .order("plan_id", { ascending: true })
        .order("position", { ascending: true }),
      supabase
        .from("day_route_calculations")
        .select("plan_id, calculated_legs")
        .in("plan_id", planIds),
    ]);
    if (stopsResult.error || calculationsResult.error)
      return {
        data: null,
        error:
          stopsResult.error?.message ??
          calculationsResult.error?.message ??
          "The saved Day routes could not be loaded.",
      };
    stops = (stopsResult.data ?? []) as ComparisonRouteStopRow[];
    calculations = (calculationsResult.data ?? []) as ComparisonRouteCalculationRow[];
  }

  return {
    data: attachVariantComparisonDayRoutes(projections, activities, plans, stops, calculations),
    error: null,
  };
}
