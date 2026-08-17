"use server";

import { revalidatePath } from "next/cache";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { ownerAttachmentsFromRows } from "@/features/attachments/owner-attachment-records";
import {
  clearItineraryItemsSchema,
  type ClearItineraryItemsInput,
} from "@/features/itinerary/day-schema";
import {
  deleteItineraryItemSchema,
  updateItineraryItemSchema,
  type CreateItineraryItemInput,
  type DeleteItineraryItemInput,
  type UpdateItineraryItemInput,
} from "@/features/itinerary/item-schema";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import { normalizedOptional, scheduleKind } from "@/features/itinerary/mutation-helpers";
import type { MutationResult } from "@/features/itinerary/types";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/types/database";
import {
  firstIssue,
  mutationError,
  persistPlaceSnapshot,
  replaceItemLinks,
  withPlace,
} from "@/features/itinerary/action-helpers";
import { validateVariantDay } from "@/features/itinerary/item-action-validation";
import { createItineraryItemMutation } from "@/features/itinerary/item-create-action";

export async function loadPlannerWorkspace(tripId: string, variantId: string) {
  return getPlannerWorkspace(tripId, variantId);
}

export async function createItineraryItem(
  input: CreateItineraryItemInput,
): Promise<MutationResult> {
  return createItineraryItemMutation(input);
}

export async function updateItineraryItem(
  input: UpdateItineraryItemInput,
): Promise<MutationResult> {
  const parsed = updateItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (parsed.data.type === "location")
    return {
      error: "Legacy City data is preserved for compatibility; edit an Activity place instead.",
    };

  if (parsed.data.dayId) {
    const dayError = await validateVariantDay(
      parsed.data.tripId,
      parsed.data.variantId,
      parsed.data.dayId,
    );
    if (dayError) return { error: dayError };
  }

  const supabase = await createClient();
  const { data: existingItem, error: existingItemError } = await supabase
    .from("itinerary_items")
    .select("type, day_id, start_time, end_time, price_amount, price_currency")
    .eq("id", parsed.data.id)
    .eq("trip_id", parsed.data.tripId)
    .eq("variant_id", parsed.data.variantId)
    .maybeSingle();
  if (existingItemError || !existingItem)
    return {
      error: mutationError(
        existingItemError?.message ?? "You do not have permission to change this item.",
      ),
    };
  if (existingItem.type === "location")
    return {
      error: "Legacy City data is preserved for compatibility; edit an Activity place instead.",
    };

  let persistedPlaceId: string | null | undefined;
  try {
    persistedPlaceId = parsed.data.placeSnapshot
      ? await persistPlaceSnapshot(supabase, parsed.data.tripId, parsed.data.placeSnapshot)
      : undefined;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The map place could not be saved." };
  }
  if (parsed.data.type === "transport" && parsed.data.details && "mode" in parsed.data.details) {
    const dayId = parsed.data.dayId ?? existingItem.day_id;
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
  if (parsed.data.priceAmount !== undefined) values.price_amount = parsed.data.priceAmount;
  if (parsed.data.priceAmount !== undefined || parsed.data.priceCurrency !== undefined)
    values.price_currency =
      parsed.data.priceAmount === null
        ? null
        : (parsed.data.priceCurrency ?? existingItem.price_currency);
  if (parsed.data.startTime !== undefined)
    values.start_time = normalizedOptional(parsed.data.startTime);
  if (parsed.data.title !== undefined) values.title = parsed.data.title.trim();
  if (parsed.data.type !== undefined) values.type = parsed.data.type;
  if (parsed.data.startTime !== undefined || parsed.data.endTime !== undefined) {
    let startTime = normalizedOptional(parsed.data.startTime);
    let endTime = normalizedOptional(parsed.data.endTime);
    if (parsed.data.startTime === undefined) startTime = existingItem.start_time;
    if (parsed.data.endTime === undefined) endTime = existingItem.end_time;
    values.schedule_kind = scheduleKind(startTime, endTime);
  }

  const { data, error } = await supabase
    .from("itinerary_items")
    .update(values)
    .eq("id", parsed.data.id)
    .eq("trip_id", parsed.data.tripId)
    .eq("variant_id", parsed.data.variantId)
    .select(
      "*, attachments:asset_links(id, public_ref, display_filename, sort_order, include_in_share, created_at, asset:assets!asset_links_asset_owner_fkey(media_kind, mime_type, byte_size, status, width, height, duration_seconds))",
    )
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

  const { attachments: attachmentRows, ...updatedItem } = data;
  const itemWithAttachments = {
    ...updatedItem,
    attachments: ownerAttachmentsFromRows(attachmentRows),
  };

  revalidatePath(`/trips/${data.trip_id}`);
  return {
    data:
      persistedPlaceId !== undefined
        ? {
            ...withPlace(itemWithAttachments, parsed.data.placeSnapshot, persistedPlaceId),
            ...(links && { links }),
          }
        : { ...itemWithAttachments, ...(links && { links }) },
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
  if (currentItem.type === "location")
    return { error: "Legacy City data is retained for compatibility and cannot be deleted here." };
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

  await drainAssetDeletionQueue(10);
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
  const itemsById = new Map(
    workspaceResult.data.days.flatMap(({ items }) => items).map((item) => [item.id, item]),
  );
  if (parsed.data.itemIds.some((id) => itemsById.get(id)?.type === "location"))
    return { error: "Legacy City data is retained for compatibility and cannot be cleared here." };

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

  await drainAssetDeletionQueue(Math.min(100, parsed.data.itemIds.length * 5));
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: { ids: parsed.data.itemIds } };
}
