import type { ItineraryItem } from "@/features/itinerary/types";
import { nameTripAfterFirstPlace } from "@/features/trips/auto-title";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";

export function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Check the item and try again.";
}

export function mutationError(message?: string) {
  if (message?.includes("itinerary_items_unique_transport_mode_per_day"))
    return "That transport type is already planned for this day. Choose a different type.";
  return message?.includes("row-level security") || message?.includes("permission denied")
    ? "You do not have permission to change itinerary items."
    : (message ?? "The itinerary item could not be saved.");
}

export async function persistPlaceSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  snapshot?: PlaceSnapshot | null,
) {
  if (!snapshot) return null;
  if (snapshot.provider !== "google" || !snapshot.providerPlaceId)
    throw new Error("Only normalized Google place snapshots can be persisted here.");
  const { data, error } = await supabase.rpc("upsert_google_place_snapshot_v2", {
    place_administrative_area_name: snapshot.administrativeAreaName,
    place_country_code: snapshot.countryCode,
    place_display_name: snapshot.displayName,
    place_formatted_address: snapshot.formattedAddress ?? "",
    place_latitude: snapshot.latitude,
    place_locality_kind: snapshot.localityKind,
    place_locality_name: snapshot.localityName,
    place_longitude: snapshot.longitude,
    provider_place_id: snapshot.providerPlaceId,
    target_trip_id: tripId,
  });
  if (error || !data)
    throw new Error(mutationError(error?.message ?? "The map place could not be saved."));
  await nameTripAfterFirstPlace(supabase, tripId, snapshot);
  return data;
}

export function withPlace(
  item: Tables<"itinerary_items">,
  snapshot?: PlaceSnapshot | null,
  placeId?: string | null,
): ItineraryItem {
  return { ...item, place: snapshot && placeId ? { ...snapshot, id: placeId } : null };
}

export async function replaceItemLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  links: { label: string; url: string }[],
) {
  const { data: existing, error: readError } = await supabase
    .from("itinerary_item_links")
    .select("id")
    .eq("item_id", itemId);
  if (readError) throw new Error(mutationError(readError.message));
  const existingIds = (existing ?? []).map(({ id }) => id);
  if (!links.length) {
    if (existingIds.length) {
      const { error } = await supabase.from("itinerary_item_links").delete().in("id", existingIds);
      if (error) throw new Error(mutationError(error.message));
    }
    return [];
  }
  const { data, error } = await supabase
    .from("itinerary_item_links")
    .insert(
      links.map((link, sort_order) => ({
        item_id: itemId,
        label: link.label,
        url: link.url,
        sort_order,
      })),
    )
    .select("id, item_id, label, url, sort_order");
  if (error) throw new Error(mutationError(error.message));
  if (existingIds.length) {
    const { error: deleteError } = await supabase
      .from("itinerary_item_links")
      .delete()
      .in("id", existingIds);
    if (deleteError) {
      await supabase
        .from("itinerary_item_links")
        .delete()
        .in(
          "id",
          (data ?? []).map(({ id }) => id),
        );
      throw new Error(mutationError(deleteError.message));
    }
  }
  return data ?? [];
}
