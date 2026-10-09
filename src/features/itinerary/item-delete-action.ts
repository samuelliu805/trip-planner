"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getPlannerWorkspace } from "./data";

import { drainAssetDeletionQueue } from "@/features/attachments/cleanup.server";
import { firstIssue, mutationError } from "@/features/itinerary/action-helpers";
import {
  deleteItineraryItemSchema,
  type DeleteItineraryItemInput,
} from "@/features/itinerary/item-schema";
import { reportItemMutation } from "@/features/itinerary/item-telemetry.server";
import type { MutationResult } from "@/features/itinerary/types";
import { getRelationalDatabase } from "@/platform/composition/server";

export async function deleteItineraryItem(
  input: DeleteItineraryItemInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = deleteItineraryItemSchema.safeParse(input);
  let result: MutationResult<{ id: string }>;
  if (!parsed.success) result = { error: firstIssue(parsed.error), code: "validation" };
  else {
    const database = await getRelationalDatabase();
    const deleted = await database.rpc("delete_itinerary_item_v2", {
      expected_items_version: parsed.data.expectedItemsVersion,
      expected_version: parsed.data.expectedVersion,
      target_item_id: parsed.data.id,
      target_operation_id: parsed.data.operationId,
      target_trip_id: parsed.data.tripId,
      target_variant_id: parsed.data.variantId,
    });
    if (deleted.error)
      result = {
        code: deleted.error.code === "40001" ? "conflict" : "unexpected",
        error:
          deleted.error.code === "40001"
            ? "Someone else saved this item first."
            : mutationError(deleted.error.message),
      };
    else {
      const workspace = await getPlannerWorkspace(parsed.data.tripId, parsed.data.variantId);
      result = workspace.data
        ? {
            data: { id: parsed.data.id },
            sync: { operationId: input.operationId, full: true, workspace: workspace.data },
          }
        : { error: workspace.error ?? "The deleted item could not be confirmed." };
      after(() => drainAssetDeletionQueue(10));
      revalidatePath(`/trips/${parsed.data.tripId}`);
    }
  }
  return reportItemMutation({
    itemType: input.itemKind,
    mutation: "delete",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}
