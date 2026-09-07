"use server";

import { revalidatePath } from "next/cache";
import {
  copyItineraryItemsSchema,
  insertTripDaySchema,
  removeTripDaySchema,
  reorderVariantDaysSchema,
  reorderItineraryItemsSchema,
  type CopyItineraryItemsInput,
  type InsertTripDayInput,
  type RemoveTripDayInput,
  type ReorderVariantDaysInput,
  type ReorderItineraryItemsInput,
} from "@/features/itinerary/day-schema";
import type { ItineraryItem, MutationResult } from "@/features/itinerary/types";
import { getRelationalDatabase } from "@/platform/composition/server";
import { firstIssue, mutationError } from "@/features/itinerary/action-helpers";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import { reportItemMutations } from "@/features/itinerary/item-telemetry.server";

export async function insertTripDay(
  input: InsertTripDayInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = insertTripDaySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("insert_variant_day_v2", {
    before_day_number: parsed.data.beforeDayNumber,
    expected_days_version: parsed.data.expectedDaysVersion,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error || !data)
    return { error: mutationError(error?.message ?? "The day could not be inserted.") };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: { id: String((data as { dayId?: string }).dayId) } };
}

export async function removeTripDay(
  input: RemoveTripDayInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = removeTripDaySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("remove_variant_day_v2", {
    expected_day_version: parsed.data.expectedVersion,
    expected_days_version: parsed.data.expectedDaysVersion,
    target_day_id: parsed.data.dayId,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error || !data)
    return { error: mutationError(error?.message ?? "The day could not be removed.") };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: { id: parsed.data.dayId } };
}

export async function reorderVariantDays(
  input: ReorderVariantDaysInput,
): Promise<MutationResult<import("@/features/itinerary/types").PlannerWorkspace>> {
  const parsed = reorderVariantDaysSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { error } = await database.rpc("reorder_variant_days_v2", {
    expected_days_version: parsed.data.expectedDaysVersion,
    ordered_day_ids: parsed.data.orderedDayIds,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error) return { error: mutationError(error.message) };
  const workspace = await getPlannerWorkspace(parsed.data.tripId, parsed.data.variantId);
  if (workspace.error || !workspace.data)
    return { error: workspace.error ?? "The saved Day order could not be reloaded." };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: workspace.data };
}

export async function reorderItineraryItems(
  input: ReorderItineraryItemsInput,
): Promise<MutationResult<ItineraryItem[]>> {
  const result = await reorderItineraryItemsMutation(input);
  return reportItemMutations({
    itemTypes: result.data?.map(({ type }) => type) ?? input.itemKinds ?? [],
    mutation: "update",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}

async function reorderItineraryItemsMutation(
  input: ReorderItineraryItemsInput,
): Promise<MutationResult<ItineraryItem[]>> {
  const parsed = reorderItineraryItemsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const database = await getRelationalDatabase();
  const { error } = await database.rpc("reorder_itinerary_items_v2", {
    expected_items_version: parsed.data.expectedItemsVersion,
    ordered_item_ids: parsed.data.items.map(({ id }) => id),
    target_day_id: parsed.data.dayId,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
  });
  if (error) return { error: mutationError(error.message) };

  const workspaceResult = await getPlannerWorkspace(parsed.data.tripId, parsed.data.variantId);
  const data = workspaceResult.data?.days.find(({ id }) => id === parsed.data.dayId)?.items;
  if (workspaceResult.error || !data)
    return { error: workspaceResult.error ?? "The saved item order could not be reloaded." };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data };
}

export async function copyItineraryItems(
  input: CopyItineraryItemsInput,
): Promise<MutationResult<ItineraryItem[]>> {
  const result = await copyItineraryItemsMutation(input);
  return reportItemMutations({
    itemTypes: result.data?.map(({ type }) => type) ?? input.itemKinds ?? [],
    mutation: "create",
    operationId: input.operationId,
    result,
    surface: input.surface,
  });
}

async function copyItineraryItemsMutation(
  input: CopyItineraryItemsInput,
): Promise<MutationResult<ItineraryItem[]>> {
  const parsed = copyItineraryItemsSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  const database = await getRelationalDatabase();
  const { data: copyResult, error } = await database.rpc("copy_itinerary_items_v2", {
    expected_items_version: parsed.data.expectedItemsVersion,
    preserve_place: parsed.data.preservePlace,
    replace_target_item_ids: parsed.data.replaceTargetItemIds,
    source_item_ids: parsed.data.sourceItemIds,
    target_day_id: parsed.data.targetDayId,
    target_operation_id: parsed.data.operationId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error)
    return {
      code: error.code === "40001" ? "conflict" : "unexpected",
      error: mutationError(error.message),
    };
  const workspace = await getPlannerWorkspace(parsed.data.tripId, parsed.data.variantId);
  const targetItems = workspace.data?.days.find(({ id }) => id === parsed.data.targetDayId)?.items;
  if (!targetItems) return { error: workspace.error ?? "Copied items could not be reloaded." };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  const copiedIds = new Set(
    copyResult && typeof copyResult === "object" && !Array.isArray(copyResult)
      ? ((copyResult.itemIds as string[] | undefined) ?? [])
      : [],
  );
  return { data: targetItems.filter(({ id }) => copiedIds.has(id)) };
}
