import { createClient } from "@/lib/supabase/server";

export async function listTrips() {
  const supabase = await createClient();
  return supabase
    .from("trips")
    .select("*, route_variants(id, name, color, is_primary)")
    .eq("route_variants.is_primary", true)
    .order("start_date", { ascending: true });
}

export async function getTrip(tripId: string) {
  const supabase = await createClient();
  return supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
}
