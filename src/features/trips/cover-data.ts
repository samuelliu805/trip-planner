import "server-only";

import { getRelationalDatabase } from "@/platform/composition/server";
import type { Trip } from "@/platform/contracts/trips";
import { selectTripCover, type TripCoverCandidate, type TripCoverSource } from "./cover-selection";

type CoverRow = TripCoverCandidate & { trip_id: string; variant_id: string };

/** One authenticated, RLS-scoped read for the visible trip list. No provider API calls. */
export async function getTripCoverSources(trips: Pick<Trip, "id" | "route_variants">[]) {
  const result = new Map<string, TripCoverSource>();
  const variants = new Map(
    trips.flatMap((trip) => {
      const primary = trip.route_variants?.find((variant) => variant.is_primary);
      return primary ? [[trip.id, primary.id] as const] : [];
    }),
  );
  if (!variants.size) return result;
  const database = await getRelationalDatabase();
  const { data, error } = await database
    .from("itinerary_items")
    .select<CoverRow>(
      "trip_id, variant_id, day_id, sort_order, type, place:places(id, source, google_place_id, display_name, locality_name, country_code)",
    )
    .in("trip_id", [...variants.keys()])
    .in("variant_id", [...variants.values()])
    .in("type", ["location", "hotel", "activity", "meal"]);
  if (error) return result;
  for (const trip of trips) {
    const cover = selectTripCover(
      (data ?? []).filter(
        (row) => row.trip_id === trip.id && row.variant_id === variants.get(trip.id),
      ),
    );
    if (cover) result.set(trip.id, cover);
  }
  return result;
}

export async function getCurrentTripCoverSource(tripId: string) {
  const database = await getRelationalDatabase();
  const { data, error } = await database
    .from("route_variants")
    .select("id, name, color, is_primary")
    .eq("trip_id", tripId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error || !data) return undefined;
  return (await getTripCoverSources([{ id: tripId, route_variants: [data] }])).get(tripId);
}
