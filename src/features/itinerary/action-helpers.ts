import type { ItineraryItem } from "@/features/itinerary/types";
import { nameTripAfterFirstPlace } from "@/features/trips/auto-title";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import { getBackendCapabilities, getRelationalDatabase } from "@/platform/composition/server";
import type { AppRow } from "@/platform/contracts/database";

import { providerPlaceRpcArguments } from "./place-persistence";

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
  database: Awaited<ReturnType<typeof getRelationalDatabase>>,
  tripId: string,
  snapshot?: PlaceSnapshot | null,
) {
  if (!snapshot) return null;
  const { data, error } = await database.rpc(
    "upsert_place_snapshot_v3",
    providerPlaceRpcArguments(tripId, snapshot),
  );
  if (error || !data)
    throw new Error(mutationError(error?.message ?? "The map place could not be saved."));
  await nameTripAfterFirstPlace(tripId, snapshot);
  return data;
}

export function withPlace(
  item: AppRow<"itinerary_items">,
  snapshot?: PlaceSnapshot | null,
  placeId?: string | null,
): ItineraryItem {
  return { ...item, place: snapshot && placeId ? { ...snapshot, id: placeId } : null };
}

export async function replaceItemLinks(
  database: Awaited<ReturnType<typeof getRelationalDatabase>>,
  itemId: string,
  links: { label: string; url: string }[],
) {
  if (!getBackendCapabilities().itineraryItemLinks) {
    if (links.length > 1) {
      throw new Error("This backend currently supports one booking link per itinerary item.");
    }
    return [];
  }
  const { data: existing, error: readError } = await database
    .from("itinerary_item_links")
    .select("id")
    .eq("item_id", itemId);
  if (readError) throw new Error(mutationError(readError.message));
  const existingIds = (existing ?? []).map(({ id }) => id);
  if (!links.length) {
    if (existingIds.length) {
      const { error } = await database.from("itinerary_item_links").delete().in("id", existingIds);
      if (error) throw new Error(mutationError(error.message));
    }
    return [];
  }
  const { data, error } = await database
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
    const { error: deleteError } = await database
      .from("itinerary_item_links")
      .delete()
      .in("id", existingIds);
    if (deleteError) {
      await database
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
