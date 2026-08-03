import { createClient } from "@/lib/supabase/server";
import { isRouteLegMode } from "@/features/routes/route-config";
import { parseCalculatedRouteLegs } from "@/features/routes/results";
import type { DayRouteCalculation, DayRouteLeg, DayRoutePlan } from "@/features/routes/types";
import type { Tables } from "@/types/database";

import type { PlannerWorkspace } from "./types";

export async function getPlannerVariants(
  tripId: string,
): Promise<{ data: import("./types").PlannerVariant[] | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("route_variants")
    .select("id, trip_id, name, color, is_primary")
    .eq("trip_id", tripId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return { data: null, error: error.message };
  return { data: data ?? [], error: null };
}

export async function getPlannerWorkspace(
  tripId: string,
  variantId: string,
): Promise<{ data: PlannerWorkspace | null; error: string | null }> {
  const supabase = await createClient();
  const { data: variant, error: variantError } = await supabase
    .from("route_variants")
    .select("id, trip_id, name, color, is_primary")
    .eq("trip_id", tripId)
    .eq("id", variantId)
    .maybeSingle();

  if (variantError || !variant)
    return {
      data: null,
      error: variantError?.message ?? "The selected route variant was not found.",
    };

  const [
    { data: days, error: daysError },
    { data: items, error: itemsError },
    { data: routePlans, error: routePlansError },
  ] = await Promise.all([
    supabase
      .from("trip_days")
      .select("id, variant_id, day_number, date, title, notes")
      .eq("variant_id", variant.id)
      .order("day_number", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select(
        "*, links:itinerary_item_links(id, item_id, label, url, sort_order), place:places(id, source, google_place_id, display_name, formatted_address, latitude, longitude)",
      )
      .eq("trip_id", tripId)
      .eq("variant_id", variant.id)
      .order("day_id", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("day_route_plans")
      .select("*")
      .eq("trip_id", tripId)
      .eq("variant_id", variant.id)
      .order("day_id", { ascending: true }),
  ]);

  if (daysError || itemsError || routePlansError)
    return {
      data: null,
      error:
        daysError?.message ??
        itemsError?.message ??
        routePlansError?.message ??
        "Could not load the planner.",
    };

  const planIds = (routePlans ?? []).map(({ id }) => id);
  let routeStops: Tables<"day_route_stops">[] = [];
  let routeLegs: Tables<"day_route_legs">[] = [];
  let routeCalculations: Tables<"day_route_calculations">[] = [];
  if (planIds.length) {
    const [stopsResult, legsResult, calculationsResult] = await Promise.all([
      supabase
        .from("day_route_stops")
        .select("*")
        .in("plan_id", planIds)
        .order("position", { ascending: true }),
      supabase
        .from("day_route_legs")
        .select("*")
        .in("plan_id", planIds)
        .order("position", { ascending: true }),
      supabase.from("day_route_calculations").select("*").in("plan_id", planIds),
    ]);
    if (stopsResult.error || legsResult.error || calculationsResult.error) {
      return {
        data: null,
        error:
          stopsResult.error?.message ??
          legsResult.error?.message ??
          calculationsResult.error?.message ??
          "Could not load day routes.",
      };
    }
    routeStops = stopsResult.data ?? [];
    routeLegs = legsResult.data ?? [];
    routeCalculations = calculationsResult.data ?? [];
  }

  const itemsByDay = new Map<string, import("./types").ItineraryItem[]>();
  for (const row of items ?? []) {
    const snapshot = row.place;
    const item = {
      ...row,
      links: [...(row.links ?? [])].sort((a, b) => a.sort_order - b.sort_order),
      place:
        snapshot?.display_name && snapshot.latitude !== null && snapshot.longitude !== null
          ? {
              id: snapshot.id,
              provider: snapshot.source,
              ...(snapshot.google_place_id && { providerPlaceId: snapshot.google_place_id }),
              displayName: snapshot.display_name,
              ...(snapshot.formatted_address && { formattedAddress: snapshot.formatted_address }),
              latitude: snapshot.latitude,
              longitude: snapshot.longitude,
            }
          : null,
    } satisfies import("./types").ItineraryItem;
    const dayItems = itemsByDay.get(item.day_id) ?? [];
    dayItems.push(item);
    itemsByDay.set(item.day_id, dayItems);
  }

  return {
    data: {
      variant,
      days: (days ?? []).map((day) => ({ ...day, items: itemsByDay.get(day.id) ?? [] })),
      routePlans: (routePlans ?? []).map((plan): DayRoutePlan => {
        const calculation = routeCalculations.find(({ plan_id }) => plan_id === plan.id);
        const calculatedLegs = calculation
          ? parseCalculatedRouteLegs(calculation.calculated_legs)
          : null;
        const normalizedCalculation: DayRouteCalculation | null =
          calculation && calculatedLegs
            ? {
                computed_at: calculation.computed_at,
                config_signature: calculation.config_signature,
                plan_id: calculation.plan_id,
                provider_schema_version: calculation.provider_schema_version,
                total_distance_meters: calculation.total_distance_meters,
                total_duration_seconds: calculation.total_duration_seconds,
                calculatedLegs,
              }
            : null;
        return {
          ...plan,
          calculation: normalizedCalculation,
          legs: routeLegs
            .filter(
              (leg): leg is DayRouteLeg => leg.plan_id === plan.id && isRouteLegMode(leg.mode),
            )
            .sort((a, b) => a.position - b.position),
          stops: routeStops
            .filter(({ plan_id }) => plan_id === plan.id)
            .sort((a, b) => a.position - b.position),
        };
      }),
    },
    error: null,
  };
}
