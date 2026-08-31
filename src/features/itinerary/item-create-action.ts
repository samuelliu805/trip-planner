"use server";

import { revalidatePath } from "next/cache";

import { insertedActivityOrderIds } from "./activity-order";
import {
  firstIssue,
  mutationError,
  persistPlaceSnapshot,
  replaceItemLinks,
  withPlace,
} from "./action-helpers";
import { validateVariantDay } from "./item-action-validation";
import { normalizedOptional, normalizedTimes, scheduleKind } from "./mutation-helpers";
import { createItineraryItemSchema, type CreateItineraryItemInput } from "./item-schema";
import { reportItemMutation } from "./item-telemetry.server";
import type { MutationResult } from "./types";
import { getRelationalDatabase } from "@/platform/composition/server";
import type { AppInsert } from "@/platform/contracts/database";
import type { Json } from "../../types/database";

export async function createItineraryItem(
  input: CreateItineraryItemInput,
): Promise<MutationResult> {
  const result = await createItineraryItemMutation(input);
  return reportItemMutation({
    itemType: input.type,
    mutation: "create",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}

async function createItineraryItemMutation(
  input: CreateItineraryItemInput,
): Promise<MutationResult> {
  const parsed = createItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  if (parsed.data.type === "location")
    return { error: "City is now derived from Activity places and cannot be added separately." };

  const dayError = await validateVariantDay(
    parsed.data.tripId,
    parsed.data.variantId,
    parsed.data.dayId,
  );
  if (dayError) return { error: dayError };

  const database = await getRelationalDatabase();
  const { data: dayItems, error: orderError } = await database
    .from("itinerary_items")
    .select("id, sort_order, type")
    .eq("day_id", parsed.data.dayId)
    .order("sort_order")
    .order("id");
  if (orderError) return { error: mutationError(orderError.message) };
  const existingDayItems = dayItems ?? [];
  if (
    parsed.data.insertAfterItemId &&
    !existingDayItems.some(
      ({ id, type }) => id === parsed.data.insertAfterItemId && type !== "hotel",
    )
  )
    return { error: "The selected item position changed. Choose its position again." };

  let persistedPlaceId: string | null = null;
  try {
    persistedPlaceId = await persistPlaceSnapshot(
      database,
      parsed.data.tripId,
      parsed.data.placeSnapshot,
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The map place could not be saved." };
  }
  if (parsed.data.type === "hotel") {
    const { count, error: hotelError } = await database
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
    const { count, error: transportError } = await database
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
  const times = normalizedTimes(parsed.data.startTime, parsed.data.endTime);
  const values: AppInsert<"itinerary_items"> = {
    booking_url: parsed.data.links?.[0]?.url ?? normalizedOptional(parsed.data.bookingUrl),
    day_id: parsed.data.dayId,
    details: parsed.data.details as Json,
    ...times,
    notes: normalizedOptional(parsed.data.notes),
    place_id: persistedPlaceId ?? parsed.data.placeId ?? null,
    price_amount: parsed.data.priceAmount ?? null,
    price_currency:
      parsed.data.priceAmount === null || parsed.data.priceAmount === undefined
        ? null
        : parsed.data.priceCurrency,
    schedule_kind: scheduleKind(times.start_time, times.end_time),
    sort_order: Math.max(-1, ...existingDayItems.map(({ sort_order }) => sort_order)) + 1,
    title: parsed.data.title.trim(),
    trip_id: parsed.data.tripId,
    type: parsed.data.type,
    variant_id: parsed.data.variantId,
  };
  const { data, error } = await database
    .from("itinerary_items")
    .insert(values)
    .select("*")
    .maybeSingle();
  if (error || !data) return { error: mutationError(error?.message) };

  let links;
  try {
    links = await replaceItemLinks(database, data.id, parsed.data.links ?? []);
  } catch (linkError) {
    await database.from("itinerary_items").delete().eq("id", data.id);
    return {
      error: linkError instanceof Error ? linkError.message : "The links could not be saved.",
    };
  }

  const orderedItemIds = insertedActivityOrderIds(
    existingDayItems,
    { id: data.id, sort_order: data.sort_order, type: data.type },
    parsed.data.insertAfterItemId,
  );
  const { error: reorderError } = await database.rpc("reorder_itinerary_items", {
    ordered_item_ids: orderedItemIds,
    target_day_id: parsed.data.dayId,
  });
  if (reorderError) {
    await database.from("itinerary_items").delete().eq("id", data.id);
    return { error: mutationError(reorderError.message) };
  }

  revalidatePath(`/trips/${data.trip_id}`);
  return {
    data: {
      ...withPlace(data, parsed.data.placeSnapshot, persistedPlaceId),
      links,
      sort_order: orderedItemIds.indexOf(data.id),
    },
  };
}
