import { createClient } from "@/lib/supabase/server";

import type { PlannerWorkspace } from "./types";

export async function getPlannerWorkspace(
  tripId: string,
): Promise<{ data: PlannerWorkspace | null; error: string | null }> {
  const supabase = await createClient();
  const { data: variant, error: variantError } = await supabase
    .from("route_variants")
    .select("id, trip_id, name, color, is_primary")
    .eq("trip_id", tripId)
    .eq("is_primary", true)
    .maybeSingle();

  if (variantError || !variant)
    return { data: null, error: variantError?.message ?? "Primary Route A was not found." };

  const [
    { data: days, error: daysError },
    { data: items, error: itemsError },
    { data: routes, error: routesError },
  ] = await Promise.all([
    supabase
      .from("trip_days")
      .select("id, variant_id, day_number, date, title, notes, route_travel_mode")
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
    supabase.from("day_routes").select("*").eq("variant_id", variant.id),
  ]);

  if (daysError || itemsError || routesError)
    return {
      data: null,
      error:
        daysError?.message ??
        itemsError?.message ??
        routesError?.message ??
        "Could not load the planner.",
    };

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
      days: (days ?? []).map((day) => ({
        ...day,
        items: itemsByDay.get(day.id) ?? [],
        route: (routes ?? []).find((route) => route.day_id === day.id) ?? null,
      })),
    },
    error: null,
  };
}
