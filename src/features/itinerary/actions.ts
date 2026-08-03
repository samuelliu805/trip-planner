"use server";

import { revalidatePath } from "next/cache";

import {
  createItineraryItemSchema,
  clearItineraryItemsSchema,
  deleteItineraryItemSchema,
  updateItineraryItemSchema,
  type CreateItineraryItemInput,
  type ClearItineraryItemsInput,
  type DeleteItineraryItemInput,
  type UpdateItineraryItemInput,
} from "@/features/itinerary/schema";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import {
  normalizedOptional,
  normalizedTimes,
  scheduleKind,
} from "@/features/itinerary/mutation-helpers";
import type { MutationResult } from "@/features/itinerary/types";
import { createClient } from "@/lib/supabase/server";
import type { Json, TablesInsert, TablesUpdate } from "@/types/database";
import {
  firstIssue,
  mutationError,
  persistPlaceSnapshot,
  replaceItemLinks,
  withPlace,
} from "@/features/itinerary/action-helpers";
import {
  neighboringCityError,
  neighboringCityConflictAfterRemoving,
} from "@/features/routes/city-order";
import {
  prospectiveCityError,
  validateProspectiveCity,
  validateVariantDay,
} from "@/features/itinerary/item-action-validation";

export async function loadPlannerWorkspace(tripId: string, variantId: string) {
  return getPlannerWorkspace(tripId, variantId);
}

export async function createItineraryItem(
  input: CreateItineraryItemInput,
): Promise<MutationResult> {
  const parsed = createItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const dayError = await validateVariantDay(
    parsed.data.tripId,
    parsed.data.variantId,
    parsed.data.dayId,
  );
  if (dayError) return { error: dayError };

  if (parsed.data.type === "location") {
    const cityError = await validateProspectiveCity({
      dayId: parsed.data.dayId,
      placeId: parsed.data.placeId,
      providerPlaceId: parsed.data.placeSnapshot?.providerPlaceId,
      title: parsed.data.title,
      tripId: parsed.data.tripId,
      variantId: parsed.data.variantId,
    });
    if (cityError) return { error: cityError };
  }

  const supabase = await createClient();
  let persistedPlaceId: string | null = null;
  try {
    persistedPlaceId = await persistPlaceSnapshot(
      supabase,
      parsed.data.tripId,
      parsed.data.placeSnapshot,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The map place could not be saved." };
  }
  if (parsed.data.type === "hotel") {
    const { count, error: hotelError } = await supabase
      .from("itinerary_items")
      .select("id", { count: "exact", head: true })
      .eq("day_id", parsed.data.dayId)
      .eq("type", "hotel");
    if (hotelError) return { error: mutationError(hotelError.message) };
    if (count)
      return { error: "Only one hotel is allowed per day. Edit the existing hotel instead." };
  }
  if (parsed.data.type === "transport") {
    const mode = parsed.data.details.mode;
    const { count, error: transportError } = await supabase
      .from("itinerary_items")
      .select("id", { count: "exact", head: true })
      .eq("day_id", parsed.data.dayId)
      .eq("type", "transport")
      .contains("details", { mode });
    if (transportError) return { error: mutationError(transportError.message) };
    if (count)
      return {
        error: `This day already has ${parsed.data.title}. Choose a different transport type.`,
      };
  }
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
    booking_url: parsed.data.links?.[0]?.url ?? normalizedOptional(parsed.data.bookingUrl),
    day_id: parsed.data.dayId,
    details: parsed.data.details as Json,
    ...times,
    notes: normalizedOptional(parsed.data.notes),
    place_id: persistedPlaceId ?? parsed.data.placeId ?? null,
    schedule_kind: scheduleKind(times.start_time, times.end_time),
    sort_order: (lastItem?.sort_order ?? -1) + 1,
    title: parsed.data.title.trim(),
    trip_id: parsed.data.tripId,
    type: parsed.data.type,
    variant_id: parsed.data.variantId,
  };
  const { data, error } = await supabase
    .from("itinerary_items")
    .insert(values)
    .select("*")
    .maybeSingle();
  if (error || !data) return { error: mutationError(error?.message) };

  let links;
  try {
    links = await replaceItemLinks(supabase, data.id, parsed.data.links ?? []);
  } catch (linkError) {
    await supabase.from("itinerary_items").delete().eq("id", data.id);
    return {
      error: linkError instanceof Error ? linkError.message : "The links could not be saved.",
    };
  }

  revalidatePath(`/trips/${data.trip_id}`);
  return { data: { ...withPlace(data, parsed.data.placeSnapshot, persistedPlaceId), links } };
}

export async function updateItineraryItem(
  input: UpdateItineraryItemInput,
): Promise<MutationResult> {
  const parsed = updateItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  if (parsed.data.dayId) {
    const dayError = await validateVariantDay(
      parsed.data.tripId,
      parsed.data.variantId,
      parsed.data.dayId,
    );
    if (dayError) return { error: dayError };
  }

  if (parsed.data.type === "location") {
    const currentWorkspace = await getPlannerWorkspace(parsed.data.tripId, parsed.data.variantId);
    const currentItem = currentWorkspace.data?.days
      .flatMap(({ items }) => items)
      .find(({ id }) => id === parsed.data.id);
    const cityError =
      currentWorkspace.error || !currentWorkspace.data || !currentItem
        ? (currentWorkspace.error ?? "The City order could not be checked.")
        : prospectiveCityError(currentWorkspace.data, {
            dayId: parsed.data.dayId ?? currentItem.day_id,
            itemId: parsed.data.id,
            placeId: parsed.data.placeId,
            providerPlaceId: parsed.data.placeSnapshot?.providerPlaceId,
            title: parsed.data.title ?? currentItem.title,
          });
    if (cityError) return { error: cityError };
  }

  const supabase = await createClient();
  let persistedPlaceId: string | null | undefined;
  try {
    persistedPlaceId = parsed.data.placeSnapshot
      ? await persistPlaceSnapshot(supabase, parsed.data.tripId, parsed.data.placeSnapshot)
      : undefined;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The map place could not be saved." };
  }
  if (parsed.data.type === "transport" && parsed.data.details && "mode" in parsed.data.details) {
    const { data: current, error: currentError } = await supabase
      .from("itinerary_items")
      .select("day_id")
      .eq("id", parsed.data.id)
      .eq("trip_id", parsed.data.tripId)
      .eq("variant_id", parsed.data.variantId)
      .maybeSingle();
    if (currentError || !current)
      return {
        error: mutationError(
          currentError?.message ?? "You do not have permission to change this item.",
        ),
      };
    const dayId = parsed.data.dayId ?? current.day_id;
    const mode = parsed.data.details.mode as string;
    const { count, error: transportError } = await supabase
      .from("itinerary_items")
      .select("id", { count: "exact", head: true })
      .eq("day_id", dayId)
      .eq("type", "transport")
      .contains("details", { mode })
      .neq("id", parsed.data.id);
    if (transportError) return { error: mutationError(transportError.message) };
    if (count)
      return {
        error: `This day already has ${parsed.data.title ?? "that transport type"}. Choose a different transport type.`,
      };
  }
  const values: TablesUpdate<"itinerary_items"> = {};
  if (parsed.data.links !== undefined) values.booking_url = parsed.data.links[0]?.url ?? null;
  else if (parsed.data.bookingUrl !== undefined)
    values.booking_url = normalizedOptional(parsed.data.bookingUrl);
  if (parsed.data.dayId !== undefined) values.day_id = parsed.data.dayId;
  if (parsed.data.details !== undefined) values.details = parsed.data.details;
  if (parsed.data.endTime !== undefined) values.end_time = normalizedOptional(parsed.data.endTime);
  if (parsed.data.notes !== undefined) values.notes = normalizedOptional(parsed.data.notes);
  if (persistedPlaceId !== undefined) values.place_id = persistedPlaceId;
  else if (parsed.data.placeId !== undefined) values.place_id = parsed.data.placeId;
  if (parsed.data.startTime !== undefined)
    values.start_time = normalizedOptional(parsed.data.startTime);
  if (parsed.data.title !== undefined) values.title = parsed.data.title.trim();
  if (parsed.data.type !== undefined) values.type = parsed.data.type;
  if (parsed.data.startTime !== undefined || parsed.data.endTime !== undefined) {
    let startTime = normalizedOptional(parsed.data.startTime);
    let endTime = normalizedOptional(parsed.data.endTime);
    if (parsed.data.startTime === undefined || parsed.data.endTime === undefined) {
      const { data: current, error: readError } = await supabase
        .from("itinerary_items")
        .select("start_time, end_time")
        .eq("id", parsed.data.id)
        .eq("trip_id", parsed.data.tripId)
        .eq("variant_id", parsed.data.variantId)
        .maybeSingle();
      if (readError || !current)
        return {
          error: mutationError(
            readError?.message ?? "You do not have permission to change this item.",
          ),
        };
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
    .eq("variant_id", parsed.data.variantId)
    .select("*")
    .maybeSingle();
  if (error || !data)
    return {
      error: mutationError(error?.message ?? "You do not have permission to change this item."),
    };

  let links;
  try {
    links =
      parsed.data.links === undefined
        ? undefined
        : await replaceItemLinks(supabase, data.id, parsed.data.links);
  } catch (linkError) {
    return {
      error: linkError instanceof Error ? linkError.message : "The links could not be saved.",
    };
  }

  revalidatePath(`/trips/${data.trip_id}`);
  return {
    data:
      persistedPlaceId !== undefined
        ? {
            ...withPlace(data, parsed.data.placeSnapshot, persistedPlaceId),
            ...(links && { links }),
          }
        : { ...data, ...(links && { links }) },
  };
}

export async function deleteItineraryItem(
  input: DeleteItineraryItemInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = deleteItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { data: currentItem, error: readError } = await supabase
    .from("itinerary_items")
    .select("id, type")
    .eq("id", parsed.data.id)
    .eq("trip_id", parsed.data.tripId)
    .eq("variant_id", parsed.data.variantId)
    .maybeSingle();
  if (readError || !currentItem)
    return {
      error: mutationError(readError?.message ?? "You do not have permission to delete this item."),
    };
  if (currentItem.type === "location") {
    const workspaceResult = await getPlannerWorkspace(parsed.data.tripId, parsed.data.variantId);
    if (workspaceResult.error || !workspaceResult.data)
      return { error: workspaceResult.error ?? "The City order could not be checked." };
    if (neighboringCityConflictAfterRemoving(workspaceResult.data.days, [currentItem.id]))
      return { error: neighboringCityError() };
  }
  const { data, error } = await supabase
    .from("itinerary_items")
    .delete()
    .eq("id", parsed.data.id)
    .eq("trip_id", parsed.data.tripId)
    .eq("variant_id", parsed.data.variantId)
    .select("id")
    .maybeSingle();
  if (error || !data)
    return {
      error: mutationError(error?.message ?? "You do not have permission to delete this item."),
    };

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data };
}

export async function clearItineraryItems(
  input: ClearItineraryItemsInput,
): Promise<MutationResult<{ ids: string[] }>> {
  const parsed = clearItineraryItemsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const workspaceResult = await getPlannerWorkspace(parsed.data.tripId, parsed.data.variantId);
  if (workspaceResult.error || !workspaceResult.data)
    return { error: workspaceResult.error ?? "The selected cells could not be checked." };

  const existingIds = new Set(
    workspaceResult.data.days.flatMap(({ items }) => items.map(({ id }) => id)),
  );
  if (parsed.data.itemIds.some((id) => !existingIds.has(id)))
    return { error: "The selected cells changed. Review the selection and try again." };
  if (neighboringCityConflictAfterRemoving(workspaceResult.data.days, parsed.data.itemIds))
    return { error: neighboringCityError() };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_route_variant_items", {
    target_item_ids: parsed.data.itemIds,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error || data !== parsed.data.itemIds.length)
    return {
      error: mutationError(error?.message ?? "The selected cells could not be cleared."),
    };

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: { ids: parsed.data.itemIds } };
}
