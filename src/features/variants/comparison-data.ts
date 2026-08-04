import { createClient } from "@/lib/supabase/server";

import { normalizeVariantComparisonProjection } from "./comparison-normalization";
import type {
  ComparisonCityRow,
  ComparisonDayRow,
  ComparisonVariantRow,
  VariantComparisonProjection,
} from "./comparison-types";

export async function getVariantComparison(
  tripId: string,
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
  const [daysResult, citiesResult] = await Promise.all([
    supabase
      .from("trip_days")
      .select("id, variant_id, day_number, date")
      .in("variant_id", variantIds)
      .order("day_number", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select(
        "id, variant_id, day_id, title, sort_order, place_id, place:places(id, google_place_id, formatted_address, latitude, longitude)",
      )
      .eq("trip_id", tripId)
      .in("variant_id", variantIds)
      .eq("type", "location")
      .order("day_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true }),
  ]);

  if (daysResult.error || citiesResult.error)
    return {
      data: null,
      error:
        daysResult.error?.message ??
        citiesResult.error?.message ??
        "The route comparison could not be loaded.",
    };

  return {
    data: normalizeVariantComparisonProjection(
      variants as ComparisonVariantRow[],
      (daysResult.data ?? []) as ComparisonDayRow[],
      (citiesResult.data ?? []) as ComparisonCityRow[],
    ),
    error: null,
  };
}
