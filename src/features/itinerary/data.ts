import { createClient } from "@/lib/supabase/server";

import type { PlannerWorkspace } from "./types";

export async function getPlannerWorkspace(tripId: string): Promise<{ data: PlannerWorkspace | null; error: string | null }> {
  const supabase = await createClient();
  const { data: variant, error: variantError } = await supabase
    .from("route_variants")
    .select("id, trip_id, name, color, is_primary")
    .eq("trip_id", tripId)
    .eq("is_primary", true)
    .maybeSingle();

  if (variantError || !variant) return { data: null, error: variantError?.message ?? "Primary Route A was not found." };

  const [{ data: days, error: daysError }, { data: items, error: itemsError }] = await Promise.all([
    supabase
      .from("trip_days")
      .select("id, variant_id, day_number, date, title, notes")
      .eq("variant_id", variant.id)
      .order("day_number", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", tripId)
      .eq("variant_id", variant.id)
      .order("day_id", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (daysError || itemsError) return { data: null, error: daysError?.message ?? itemsError?.message ?? "Could not load the planner." };

  const itemsByDay = new Map<string, NonNullable<typeof items>>();
  for (const item of items ?? []) {
    const dayItems = itemsByDay.get(item.day_id) ?? [];
    dayItems.push(item);
    itemsByDay.set(item.day_id, dayItems);
  }

  return {
    data: {
      variant,
      days: (days ?? []).map((day) => ({ ...day, items: itemsByDay.get(day.id) ?? [] })),
    },
    error: null,
  };
}
