import { createClient } from "@/lib/supabase/server";

import type { PlanResearchItem } from "./types";

export async function getCompareItems(tripId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_items")
    .select("*")
    .eq("trip_id", tripId)
    .order("observed_at", { ascending: false });
  return { data: data ?? [], error: error?.message ?? null };
}

export async function getPlanResearchItems(tripId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("research_items")
    .select("id, category, day_id, itinerary_item_id")
    .eq("trip_id", tripId);
  if (error) return [] satisfies PlanResearchItem[];
  return data as PlanResearchItem[];
}
