"use server";

import { revalidatePath } from "next/cache";
import {
  copyItineraryItemsSchema,
  insertTripDaySchema,
  removeTripDaySchema,
  reorderItineraryItemsSchema,
  type CopyItineraryItemsInput,
  type InsertTripDayInput,
  type RemoveTripDayInput,
  type ReorderItineraryItemsInput,
} from "@/features/itinerary/schema";
import { buildCopyRows } from "@/features/itinerary/mutation-helpers";
import type { ItineraryItem, MutationResult } from "@/features/itinerary/types";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database";
import { firstIssue, mutationError } from "@/features/itinerary/action-helpers";

export async function insertTripDay(
  input: InsertTripDayInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = insertTripDaySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("insert_trip_day", {
    before_day_number: parsed.data.beforeDayNumber,
    target_trip_id: parsed.data.tripId,
  });
  if (error || !data)
    return { error: mutationError(error?.message ?? "The day could not be inserted.") };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: { id: data } };
}

export async function removeTripDay(
  input: RemoveTripDayInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = removeTripDaySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("remove_trip_day", {
    target_day_id: parsed.data.dayId,
    target_trip_id: parsed.data.tripId,
  });
  if (error || !data)
    return { error: mutationError(error?.message ?? "The day could not be removed.") };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: { id: data } };
}

export async function reorderItineraryItems(
  input: ReorderItineraryItemsInput,
): Promise<MutationResult<ItineraryItem[]>> {
  const parsed = reorderItineraryItemsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const ids = parsed.data.items.map(({ id }) => id);
  const { data: current, error: readError } = await supabase
    .from("itinerary_items")
    .select("id, sort_order")
    .eq("trip_id", parsed.data.tripId)
    .eq("day_id", parsed.data.dayId)
    .in("id", ids);
  if (readError || current?.length !== ids.length)
    return {
      error: mutationError(
        readError?.message ?? "You do not have permission to reorder these items.",
      ),
    };

  const updates = [];
  for (const { id, sortOrder } of parsed.data.items) {
    const result = await supabase
      .from("itinerary_items")
      .update({ sort_order: sortOrder })
      .eq("id", id)
      .eq("trip_id", parsed.data.tripId)
      .eq("day_id", parsed.data.dayId)
      .select("*")
      .maybeSingle();
    updates.push(result);
    if (result.error || !result.data) {
      const originalOrders = new Map(current.map((item) => [item.id, item.sort_order]));
      await Promise.all(
        updates
          .filter(({ data }) => data)
          .map(({ data }) =>
            supabase
              .from("itinerary_items")
              .update({ sort_order: originalOrders.get(data!.id) })
              .eq("id", data!.id)
              .eq("trip_id", parsed.data.tripId),
          ),
      );
      return {
        error: mutationError(result.error?.message ?? "The new item order could not be saved."),
      };
    }
  }

  const data = updates
    .map(({ data }) => data)
    .filter((item): item is ItineraryItem => Boolean(item));
  data.sort((a, b) => a.sort_order - b.sort_order);
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data };
}

export async function copyItineraryItems(
  input: CopyItineraryItemsInput,
): Promise<MutationResult<ItineraryItem[]>> {
  const parsed = copyItineraryItemsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const [{ data: sources, error: sourceError }, { data: targetDay, error: dayError }] =
    await Promise.all([
      supabase
        .from("itinerary_items")
        .select("*, links:itinerary_item_links(id, item_id, label, url, sort_order)")
        .eq("trip_id", parsed.data.tripId)
        .in("id", parsed.data.sourceItemIds),
      supabase
        .from("trip_days")
        .select("id, variant_id")
        .eq("id", parsed.data.targetDayId)
        .maybeSingle(),
    ]);
  if (
    sourceError ||
    dayError ||
    !targetDay ||
    sources?.length !== parsed.data.sourceItemIds.length
  ) {
    return {
      error: mutationError(
        sourceError?.message ??
          dayError?.message ??
          "You do not have permission to copy these items.",
      ),
    };
  }
  if (sources.some(({ variant_id }) => variant_id !== targetDay.variant_id))
    return { error: "Items can only be copied within Route A." };

  const { data: lastItem, error: orderError } = await supabase
    .from("itinerary_items")
    .select("sort_order")
    .eq("day_id", targetDay.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) return { error: mutationError(orderError.message) };

  const sourceById = new Map((sources ?? []).map((item) => [item.id, item]));
  const orderedSources = parsed.data.sourceItemIds.map((id) => sourceById.get(id)!);
  const copies: TablesInsert<"itinerary_items">[] = buildCopyRows(
    orderedSources,
    targetDay.id,
    (lastItem?.sort_order ?? -1) + 1,
    parsed.data.preservePlace,
  );
  const { data, error } = await supabase.from("itinerary_items").insert(copies).select("*");
  if (error || !data || data.length !== copies.length)
    return { error: mutationError(error?.message ?? "Not all items could be copied.") };

  const copiedLinks = orderedSources.flatMap((source, index) =>
    (source.links ?? []).map((link) => ({
      item_id: data[index].id,
      label: link.label,
      sort_order: link.sort_order,
      url: link.url,
    })),
  );
  if (copiedLinks.length) {
    const { error: linksError } = await supabase.from("itinerary_item_links").insert(copiedLinks);
    if (linksError) {
      await supabase
        .from("itinerary_items")
        .delete()
        .in(
          "id",
          data.map(({ id }) => id),
        );
      return { error: mutationError(linksError.message) };
    }
  }

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return {
    data: data.map((item, index) => ({ ...item, links: orderedSources[index].links ?? [] })),
  };
}

export async function copyItemToDay(
  input: CopyItineraryItemsInput,
): Promise<MutationResult<ItineraryItem[]>> {
  return copyItineraryItems(input);
}

export async function copyPreviousDaySelectedValues(
  input: CopyItineraryItemsInput,
): Promise<MutationResult<ItineraryItem[]>> {
  return copyItineraryItems(input);
}
