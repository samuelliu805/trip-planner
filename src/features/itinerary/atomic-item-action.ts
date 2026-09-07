import { getRelationalDatabase } from "@/platform/composition/server";
import type { Json } from "@/types/database";

import { insertedActivityOrderIds } from "./activity-order";
import { mutationError } from "./action-helpers";
import { scheduleKind } from "./mutation-helpers";
import type { ItineraryItem, MutationResult } from "./types";
import { getItineraryItem } from "./data";
import { nameTripAfterFirstPlace } from "@/features/trips/auto-title";

type AtomicItemInput = {
  bookingUrl?: string | null;
  dayId: string;
  details?: Record<string, Json>;
  endTime?: string | null;
  expectedItemsVersion: number;
  expectedVersion: number | null;
  id: string;
  insertAfterItemId?: string | null;
  links?: Array<{ label: string; url: string }>;
  notes?: string | null;
  operationId: string;
  placeId?: string | null;
  placeSnapshot?: Json | null;
  priceAmount?: number | null;
  priceCurrency?: string | null;
  startTime?: string | null;
  title: string;
  tripId: string;
  type: ItineraryItem["type"];
  uploadSessionId?: string | null;
  variantId: string;
};

export async function saveAtomicItineraryItem(input: AtomicItemInput): Promise<MutationResult> {
  const database = await getRelationalDatabase();
  const { data: dayItems, error: orderError } = await database
    .from("itinerary_items")
    .select("id, sort_order, type")
    .eq("day_id", input.dayId)
    .order("sort_order")
    .order("id");
  if (orderError) return { error: mutationError(orderError.message) };
  const currentItems = (dayItems ?? [])
    .map((item) => ({
      ...item,
      id: String(item.id),
    }))
    .filter(({ id }) => id !== input.id);
  const orderedItemIds = insertedActivityOrderIds(
    currentItems,
    {
      id: input.id,
      sort_order: Math.max(-1, ...currentItems.map(({ sort_order }) => sort_order)) + 1,
      type: input.type,
    },
    input.insertAfterItemId,
  );
  const requestedItem = {
    bookingUrl: input.links?.[0]?.url ?? input.bookingUrl ?? null,
    details: input.details ?? {},
    endTime: input.endTime || null,
    notes: input.notes || null,
    placeId: input.placeId ?? null,
    placeSnapshot: input.placeSnapshot ?? null,
    priceAmount: input.priceAmount ?? null,
    priceCurrency: input.priceAmount == null ? null : (input.priceCurrency ?? null),
    scheduleKind: scheduleKind(input.startTime, input.endTime),
    startTime: input.startTime || null,
    title: input.title.trim(),
    type: input.type,
  } satisfies Json;
  const result = await database.rpc("save_itinerary_item_v3", {
    expected_items_version: input.expectedItemsVersion,
    // PostgREST's generated argument cannot express a nullable create sentinel.
    expected_version: input.expectedVersion as number,
    ordered_item_ids: orderedItemIds,
    requested_item: requestedItem,
    requested_links: (input.links ?? []).map((link, sortOrder) => ({ ...link, sortOrder })),
    requested_draft_session_id: (input.uploadSessionId ?? null) as unknown as string,
    target_day_id: input.dayId,
    target_item_id: input.id,
    target_operation_id: input.operationId,
    target_trip_id: input.tripId,
    target_variant_id: input.variantId,
  });
  if (result.error)
    return {
      code: result.error.code === "40001" ? "conflict" : "unexpected",
      error:
        result.error.code === "40001"
          ? "Someone else saved this item first."
          : mutationError(result.error.message),
    };
  if (!result.data || typeof result.data !== "object" || Array.isArray(result.data))
    return { error: "The saved itinerary item could not be read." };
  const saved = await getItineraryItem(input.id);
  if (!saved.data) return { error: saved.error ?? "The saved itinerary item could not be read." };
  if (input.placeSnapshot)
    await nameTripAfterFirstPlace(input.tripId, input.placeSnapshot as never).catch(
      () => undefined,
    );
  return { data: saved.data };
}
