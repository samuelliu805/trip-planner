"use server";

import { revalidatePath } from "next/cache";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { firstIssue, mutationError } from "@/features/itinerary/action-helpers";
import {
  deleteItineraryItemSchema,
  type DeleteItineraryItemInput,
} from "@/features/itinerary/item-schema";
import { reportItemMutation } from "@/features/itinerary/item-telemetry.server";
import type { MutationResult } from "@/features/itinerary/types";
import { createClient } from "@/lib/supabase/server";

type DeleteMutation = {
  itemType?: unknown;
  result: MutationResult<{ id: string }>;
};

export async function deleteItineraryItem(
  input: DeleteItineraryItemInput,
): Promise<MutationResult<{ id: string }>> {
  const { itemType, result } = await deleteItineraryItemMutation(input);
  return reportItemMutation({
    itemType: itemType ?? input.itemKind,
    mutation: "delete",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}

async function deleteItineraryItemMutation(
  input: DeleteItineraryItemInput,
): Promise<DeleteMutation> {
  const parsed = deleteItineraryItemSchema.safeParse(input);
  if (!parsed.success) return { result: { error: firstIssue(parsed.error) } };

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
      result: {
        error: mutationError(
          readError?.message ?? "You do not have permission to delete this item.",
        ),
      },
    };
  if (currentItem.type === "location")
    return {
      itemType: currentItem.type,
      result: {
        error: "Legacy City data is retained for compatibility and cannot be deleted here.",
      },
    };
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
      itemType: currentItem.type,
      result: {
        error: mutationError(error?.message ?? "You do not have permission to delete this item."),
      },
    };

  await drainAssetDeletionQueue(10);
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { itemType: currentItem.type, result: { data } };
}
