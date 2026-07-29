import { createClient } from "@/lib/supabase/server";

export async function listTrips() {
  const supabase = await createClient();
  return supabase.from("trips").select("*").order("start_date", { ascending: true });
}

export async function getTrip(tripId: string) {
  const supabase = await createClient();
  return supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
}

export async function getPrimaryTripDays(tripId: string) {
  const supabase = await createClient();
  const { data: variant, error: variantError } = await supabase
    .from("route_variants")
    .select("id, name")
    .eq("trip_id", tripId)
    .eq("is_primary", true)
    .maybeSingle();

  if (variantError || !variant) return { data: null, error: variantError };
  const { data: days, error } = await supabase
    .from("trip_days")
    .select("id, day_number, date, title")
    .eq("variant_id", variant.id)
    .order("day_number");

  return { data: { variant, days: days ?? [] }, error };
}
