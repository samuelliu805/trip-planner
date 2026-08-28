"use server";

import { revalidatePath } from "next/cache";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { ownerAttachmentsFromRows } from "@/features/attachments/owner-attachment-records";
import {
  updateItineraryItemSchema,
  type CreateItineraryItemInput,
  type DeleteItineraryItemInput,
  type UpdateItineraryItemInput,
} from "@/features/itinerary/item-schema";
import {
  clearItineraryItemsSchema,
  type ClearItineraryItemsInput,
} from "@/features/itinerary/day-schema";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import { normalizedOptional, scheduleKind } from "@/features/itinerary/mutation-helpers";
import type { ItineraryItem, MutationResult } from "@/features/itinerary/types";
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
import { insertedActivityOrderIds } from "@/features/itinerary/activity-order";
import { createItineraryItem as createItineraryItemAction } from "@/features/itinerary/item-create-action";
import { deleteItineraryItem as deleteItineraryItemAction } from "@/features/itinerary/item-delete-action";
import {
  reportItemMutation,
  reportItemMutations,
} from "@/features/itinerary/item-telemetry.server";

export async function loadPlannerWorkspace(tripId: string, variantId: string) {
  return getPlannerWorkspace(tripId, variantId);
}

export async function createItineraryItem(input: CreateItineraryItemInput) {
  return createItineraryItemAction(input);
}

export async function deleteItineraryItem(input: DeleteItineraryItemInput) {
  return deleteItineraryItemAction(input);
}

export async function clearItineraryItems(
  input: ClearItineraryItemsInput,
): Promise<MutationResult<{ ids: string[] }>> {
  const parsed = clearItineraryItemsSchema.safeParse(input);
  if (!parsed.success) return reportClearMutation(input, { error: firstIssue(parsed.error) });

  const workspaceResult = await getPlannerWorkspace(parsed.data.tripId, parsed.data.variantId);
  if (workspaceResult.error || !workspaceResult.data)
    return reportClearMutation(input, {
      error: workspaceResult.error ?? "The selected cells could not be checked.",
    });
  const items = workspaceResult.data.days.flatMap(({ items: dayItems }) => dayItems);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const itemTypes = parsed.data.itemIds.flatMap((id) => {
    const type = itemsById.get(id)?.type;
    return type ? [type] : [];
  });
  const telemetryInput = { ...input, itemKinds: itemTypes };
  if (parsed.data.itemIds.some((id) => !itemsById.has(id)))
    return reportClearMutation(telemetryInput, {
      error: "The selected cells changed. Review the selection and try again.",
    });
  if (itemTypes.includes("location"))
    return reportClearMutation(telemetryInput, {
      error: "Legacy City data is retained for compatibility and cannot be cleared here.",
    });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("clear_route_variant_items", {
    target_item_ids: parsed.data.itemIds,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error || data !== parsed.data.itemIds.length)
    return reportClearMutation(telemetryInput, {
      error: mutationError(error?.message ?? "The selected cells could not be cleared."),
    });

  await drainAssetDeletionQueue(Math.min(100, parsed.data.itemIds.length * 5));
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return reportClearMutation(telemetryInput, { data: { ids: parsed.data.itemIds } });
}

function reportClearMutation<Result extends MutationResult<{ ids: string[] }>>(
  input: ClearItineraryItemsInput,
  result: Result,
) {
  return reportItemMutations({
    itemTypes: input.itemKinds ?? [],
    mutation: "delete",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}

export async function updateItineraryItem(
  input: UpdateItineraryItemInput,
): Promise<MutationResult> {
  const result = await updateItineraryItemMutation(input);
  return reportItemMutation({
    itemType: input.type,
    mutation: "update",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}

async function updateItineraryItemMutation(
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

  const orderTargetDayId = parsed.data.dayId ?? existingItem.day_id;
  let orderTargetItems:
    Array<{ id: string; sort_order: number; type: ItineraryItem["type"] }> | undefined;
  if (parsed.data.insertAfterItemId !== undefined) {
    const { data: targetItems, error: orderReadError } = await supabase
      .from("itinerary_items")
      .select("id, sort_order, type")
      .eq("day_id", orderTargetDayId)
      .order("sort_order")
      .order("id");
    if (orderReadError) return { error: mutationError(orderReadError.message) };
    orderTargetItems = (targetItems ?? []).filter(({ id }) => id !== parsed.data.id);
    if (
      parsed.data.insertAfterItemId &&
      !orderTargetItems.some(
        ({ id, type }) => id === parsed.data.insertAfterItemId && type !== "hotel",
      )
    )
      return { error: "The selected item position changed. Choose its position again." };
  }

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
      "*, attachments:asset_links(id, public_ref, display_filename, sort_order, include_in_share, draft_session_id, created_at, asset:assets!asset_links_asset_owner_fkey(media_kind, mime_type, byte_size, status, width, height, duration_seconds))",
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

  let orderedItemIds: string[] | undefined;
  if (parsed.data.insertAfterItemId !== undefined && orderTargetItems) {
    orderedItemIds = insertedActivityOrderIds(
      orderTargetItems,
      { id: data.id, sort_order: data.sort_order, type: data.type },
      parsed.data.insertAfterItemId,
    );
    const { error: reorderError } = await supabase.rpc("reorder_itinerary_items", {
      ordered_item_ids: orderedItemIds,
      target_day_id: orderTargetDayId,
    });
    if (reorderError) return { error: mutationError(reorderError.message) };
  }

  revalidatePath(`/trips/${data.trip_id}`);
  const savedItem = {
    ...itemWithAttachments,
    ...(orderedItemIds && { sort_order: orderedItemIds.indexOf(data.id) }),
    ...(links && { links }),
  };
  return {
    data:
      persistedPlaceId !== undefined
        ? {
            ...withPlace(savedItem, parsed.data.placeSnapshot, persistedPlaceId),
          }
        : savedItem,
  };
}
