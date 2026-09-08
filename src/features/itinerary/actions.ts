"use server";

import { revalidatePath } from "next/cache";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { firstIssue, mutationError } from "@/features/itinerary/action-helpers";
import { saveAtomicItineraryItem } from "@/features/itinerary/atomic-item-action";
import {
  clearItineraryItemsSchema,
  type ClearItineraryItemsInput,
} from "@/features/itinerary/day-schema";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import { createItineraryItem as createItineraryItemAction } from "@/features/itinerary/item-create-action";
import { deleteItineraryItem as deleteItineraryItemAction } from "@/features/itinerary/item-delete-action";
import {
  updateItineraryItemSchema,
  type CreateItineraryItemInput,
  type DeleteItineraryItemInput,
  type UpdateItineraryItemInput,
} from "@/features/itinerary/item-schema";
import {
  reportItemMutation,
  reportItemMutations,
} from "@/features/itinerary/item-telemetry.server";
import type { MutationResult } from "@/features/itinerary/types";
import { getRelationalDatabase } from "@/platform/composition/server";

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
  let result: MutationResult<{ ids: string[] }>;
  if (!parsed.success) result = { error: firstIssue(parsed.error), code: "validation" };
  else {
    const database = await getRelationalDatabase();
    const cleared = await database.rpc("clear_route_variant_items_v3", {
      expected_item_versions: parsed.data.itemVersions,
      expected_items_version: parsed.data.expectedItemsVersion,
      target_item_ids: parsed.data.itemIds,
      target_operation_id: parsed.data.operationId,
      target_trip_id: parsed.data.tripId,
      target_variant_id: parsed.data.variantId,
    });
    if (cleared.error)
      result = {
        code: cleared.error.code === "40001" ? "conflict" : "unexpected",
        error: mutationError(cleared.error?.message ?? "The selected cells could not be cleared."),
      };
    else {
      await drainAssetDeletionQueue(Math.min(100, parsed.data.itemIds.length * 5));
      revalidatePath(`/trips/${parsed.data.tripId}`);
      result = { data: { ids: parsed.data.itemIds } };
    }
  }
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
  const parsed = updateItineraryItemSchema.safeParse(input);
  let result: MutationResult;
  if (!parsed.success) result = { error: firstIssue(parsed.error), code: "validation" };
  else if (!parsed.data.dayId || !parsed.data.title)
    result = { error: "The complete item draft is required.", code: "validation" };
  else
    result = await saveAtomicItineraryItem({
      ...parsed.data,
      dayId: parsed.data.dayId,
      expectedVersion: parsed.data.expectedVersion,
      title: parsed.data.title,
    });
  if (result.data) revalidatePath(`/trips/${parsed.success ? parsed.data.tripId : input.tripId}`);
  return reportItemMutation({
    itemType: input.type,
    mutation: "update",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}
