"use server";

import { revalidatePath } from "next/cache";

import {
  copyItineraryItemsSchema,
  createItineraryItemSchema,
  deleteItineraryItemSchema,
  reorderItineraryItemsSchema,
  updateItineraryItemSchema,
  type CopyItineraryItemsInput,
  type CreateItineraryItemInput,
  type DeleteItineraryItemInput,
  type ReorderItineraryItemsInput,
  type UpdateItineraryItemInput,
} from "@/features/itinerary/schema";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import { buildCopyRows, normalizedOptional, normalizedTimes, scheduleKind } from "@/features/itinerary/mutation-helpers";
import type { ItineraryItem, MutationResult } from "@/features/itinerary/types";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesInsert, TablesUpdate } from "@/types/database";

export async function loadPlannerWorkspace(tripId: string) {
  return getPlannerWorkspace(tripId);
}

function firstIssue(error: { issues: { message: string }[] }) {
  return error.issues[0]?.message ?? "Check the item and try again.";
}

function mutationError(message?: string) {
  return message?.includes("row-level security") || message?.includes("permission denied")
    ? "You do not have permission to change itinerary items."
    : message ?? "The itinerary item could not be saved.";
}

export async function createItineraryItem(input: CreateItineraryItemInput): Promise<MutationResult> {
  const parsed = createItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: lastItem, error: orderError } = await supabase
    .from("itinerary_items")
    .select("sort_order")
    .eq("day_id", parsed.data.dayId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderError) return { error: mutationError(orderError.message) };

  const times = normalizedTimes(parsed.data.startTime, parsed.data.endTime);
  const values: TablesInsert<"itinerary_items"> = {
    booking_url: normalizedOptional(parsed.data.bookingUrl),
    day_id: parsed.data.dayId,
    details: parsed.data.details as Json,
    ...times,
    notes: normalizedOptional(parsed.data.notes),
    place_id: parsed.data.placeId ?? null,
    schedule_kind: scheduleKind(times.start_time, times.end_time),
    sort_order: (lastItem?.sort_order ?? -1) + 1,
    title: parsed.data.title.trim(),
    trip_id: parsed.data.tripId,
    type: parsed.data.type,
    variant_id: parsed.data.variantId,
  };
  const { data, error } = await supabase.from("itinerary_items").insert(values).select("*").maybeSingle();
  if (error || !data) return { error: mutationError(error?.message) };

  revalidatePath(`/trips/${data.trip_id}`);
  return { data };
}

export async function updateItineraryItem(input: UpdateItineraryItemInput): Promise<MutationResult> {
  const parsed = updateItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const values: TablesUpdate<"itinerary_items"> = {};
  if (parsed.data.bookingUrl !== undefined) values.booking_url = normalizedOptional(parsed.data.bookingUrl);
  if (parsed.data.dayId !== undefined) values.day_id = parsed.data.dayId;
  if (parsed.data.details !== undefined) values.details = parsed.data.details;
  if (parsed.data.endTime !== undefined) values.end_time = normalizedOptional(parsed.data.endTime);
  if (parsed.data.notes !== undefined) values.notes = normalizedOptional(parsed.data.notes);
  if (parsed.data.placeId !== undefined) values.place_id = parsed.data.placeId;
  if (parsed.data.startTime !== undefined) values.start_time = normalizedOptional(parsed.data.startTime);
  if (parsed.data.title !== undefined) values.title = parsed.data.title.trim();
  if (parsed.data.type !== undefined) values.type = parsed.data.type;
  if (parsed.data.variantId !== undefined) values.variant_id = parsed.data.variantId;

  if (parsed.data.startTime !== undefined || parsed.data.endTime !== undefined) {
    let startTime = normalizedOptional(parsed.data.startTime);
    let endTime = normalizedOptional(parsed.data.endTime);
    if (parsed.data.startTime === undefined || parsed.data.endTime === undefined) {
      const { data: current, error: readError } = await supabase.from("itinerary_items")
        .select("start_time, end_time")
        .eq("id", parsed.data.id)
        .eq("trip_id", parsed.data.tripId)
        .maybeSingle();
      if (readError || !current) return { error: mutationError(readError?.message ?? "You do not have permission to change this item.") };
      if (parsed.data.startTime === undefined) startTime = current.start_time;
      if (parsed.data.endTime === undefined) endTime = current.end_time;
    }
    values.schedule_kind = scheduleKind(startTime, endTime);
  }

  const { data, error } = await supabase
    .from("itinerary_items")
    .update(values)
    .eq("id", parsed.data.id)
    .eq("trip_id", parsed.data.tripId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { error: mutationError(error?.message ?? "You do not have permission to change this item.") };

  revalidatePath(`/trips/${data.trip_id}`);
  return { data };
}

export async function deleteItineraryItem(input: DeleteItineraryItemInput): Promise<MutationResult<{ id: string }>> {
  const parsed = deleteItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("itinerary_items")
    .delete()
    .eq("id", parsed.data.id)
    .eq("trip_id", parsed.data.tripId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { error: mutationError(error?.message ?? "You do not have permission to delete this item.") };

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data };
}

export async function reorderItineraryItems(input: ReorderItineraryItemsInput): Promise<MutationResult<ItineraryItem[]>> {
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
  if (readError || current?.length !== ids.length) return { error: mutationError(readError?.message ?? "You do not have permission to reorder these items.") };

  const updates = [];
  for (const { id, sortOrder } of parsed.data.items) {
    const result = await supabase.from("itinerary_items")
      .update({ sort_order: sortOrder })
      .eq("id", id)
      .eq("trip_id", parsed.data.tripId)
      .eq("day_id", parsed.data.dayId)
      .select("*")
      .maybeSingle();
    updates.push(result);
    if (result.error || !result.data) {
      const originalOrders = new Map(current.map((item) => [item.id, item.sort_order]));
      await Promise.all(updates.filter(({ data }) => data).map(({ data }) => supabase.from("itinerary_items")
        .update({ sort_order: originalOrders.get(data!.id) })
        .eq("id", data!.id)
        .eq("trip_id", parsed.data.tripId)));
      return { error: mutationError(result.error?.message ?? "The new item order could not be saved.") };
    }
  }

  const data = updates.map(({ data }) => data).filter((item): item is ItineraryItem => Boolean(item));
  data.sort((a, b) => a.sort_order - b.sort_order);
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data };
}

export async function copyItineraryItems(input: CopyItineraryItemsInput): Promise<MutationResult<ItineraryItem[]>> {
  const parsed = copyItineraryItemsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const [{ data: sources, error: sourceError }, { data: targetDay, error: dayError }] = await Promise.all([
    supabase.from("itinerary_items").select("*").eq("trip_id", parsed.data.tripId).in("id", parsed.data.sourceItemIds),
    supabase.from("trip_days").select("id, variant_id").eq("id", parsed.data.targetDayId).maybeSingle(),
  ]);
  if (sourceError || dayError || !targetDay || sources?.length !== parsed.data.sourceItemIds.length) {
    return { error: mutationError(sourceError?.message ?? dayError?.message ?? "You do not have permission to copy these items.") };
  }
  if (sources.some(({ variant_id }) => variant_id !== targetDay.variant_id)) return { error: "Items can only be copied within Route A." };

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
  if (error || !data || data.length !== copies.length) return { error: mutationError(error?.message ?? "Not all items could be copied.") };

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data };
}

export async function copyItemToDay(input: CopyItineraryItemsInput): Promise<MutationResult<ItineraryItem[]>> {
  return copyItineraryItems(input);
}

export async function copyPreviousDaySelectedValues(input: CopyItineraryItemsInput): Promise<MutationResult<ItineraryItem[]>> {
  return copyItineraryItems(input);
}
