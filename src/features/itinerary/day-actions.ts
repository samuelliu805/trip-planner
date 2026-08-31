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
import { buildCopyRows } from "@/features/itinerary/mutation-helpers";
import type { ItineraryItem, ItineraryItemLink, MutationResult } from "@/features/itinerary/types";
import { getBackendCapabilities, getRelationalDatabase } from "@/platform/composition/server";
import type { AppInsert, AppRow } from "@/platform/contracts/database";
import { firstIssue, mutationError } from "@/features/itinerary/action-helpers";
import { getPlannerWorkspace } from "@/features/itinerary/data";
import { canonicalActivityOrderIds } from "@/features/itinerary/activity-order";
import { reportItemMutations } from "@/features/itinerary/item-telemetry.server";

type ItineraryItemWithLinksRow = AppRow<"itinerary_items"> & {
  links?: ItineraryItemLink[] | null;
};

export async function insertTripDay(
  input: InsertTripDayInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = insertTripDaySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("insert_variant_day", {
    before_day_number: parsed.data.beforeDayNumber,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error || !data)
    return { error: mutationError(error?.message ?? "The day could not be inserted.") };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: { id: data } };
}

export async function removeTripDay(
  input: RemoveTripDayInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = removeTripDaySchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { data, error } = await database.rpc("remove_variant_day", {
    target_day_id: parsed.data.dayId,
    target_trip_id: parsed.data.tripId,
    target_variant_id: parsed.data.variantId,
  });
  if (error || !data)
    return { error: mutationError(error?.message ?? "The day could not be removed.") };
  revalidatePath(`/trips/${parsed.data.tripId}`);
  return { data: { id: data } };
}

export async function reorderVariantDays(
  input: ReorderVariantDaysInput,
): Promise<MutationResult<import("@/features/itinerary/types").PlannerWorkspace>> {
  const parsed = reorderVariantDaysSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const database = await getRelationalDatabase();
  const { error } = await database.rpc("reorder_variant_days", {
    ordered_day_ids: parsed.data.orderedDayIds,
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
  const { error } = await database.rpc("reorder_itinerary_items", {
    ordered_item_ids: parsed.data.items.map(({ id }) => id),
    target_day_id: parsed.data.dayId,
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
  const [{ data: sources, error: sourceError }, { data: targetDay, error: dayError }] =
    await Promise.all([
      database
        .from("itinerary_items")
        .select<ItineraryItemWithLinksRow>(
          getBackendCapabilities().itineraryItemLinks
            ? "*, links:itinerary_item_links(id, item_id, label, url, sort_order)"
            : "*",
        )
        .eq("trip_id", parsed.data.tripId)
        .eq("variant_id", parsed.data.variantId)
        .in("id", parsed.data.sourceItemIds),
      database
        .from("trip_days")
        .select("id, variant_id")
        .eq("id", parsed.data.targetDayId)
        .eq("variant_id", parsed.data.variantId)
        .maybeSingle(),
    ]);
  if (
    sourceError ||
    dayError ||
    !targetDay ||
    sources?.length !== parsed.data.sourceItemIds.length
  ) {
    return {
      error: mutationError(
        sourceError?.message ??
          dayError?.message ??
          "You do not have permission to copy these items.",
      ),
    };
  }
  if (sources.some(({ variant_id }) => variant_id !== targetDay.variant_id))
    return { error: "Items can only be copied within the active route variant." };

  const { data: targetItems, error: orderError } = await database
    .from("itinerary_items")
    .select("id, sort_order, type")
    .eq("day_id", targetDay.id)
    .order("sort_order")
    .order("id");
  if (orderError) return { error: mutationError(orderError.message) };

  const sourceById = new Map((sources ?? []).map((item) => [item.id, item]));
  const orderedSources = parsed.data.sourceItemIds.map((id) => {
    const item = sourceById.get(id)!;
    return { ...item, links: item.links ?? undefined };
  });
  const copies: AppInsert<"itinerary_items">[] = buildCopyRows(
    orderedSources,
    targetDay.id,
    Math.max(-1, ...(targetItems ?? []).map(({ sort_order }) => sort_order)) + 1,
    parsed.data.preservePlace,
  );
  if (orderedSources.some(({ type }) => type === "location"))
    return { error: "Legacy City data is retained for compatibility and cannot be copied." };
  const { data, error } = await database.from("itinerary_items").insert(copies).select("*");
  if (error || !data || data.length !== copies.length)
    return { error: mutationError(error?.message ?? "Not all items could be copied.") };

  const copiedLinks = orderedSources.flatMap((source, index) =>
    (source.links ?? []).map((link) => ({
      item_id: data[index].id,
      label: link.label,
      sort_order: link.sort_order,
      url: link.url,
    })),
  );
  if (copiedLinks.length && getBackendCapabilities().itineraryItemLinks) {
    const { error: linksError } = await database.from("itinerary_item_links").insert(copiedLinks);
    if (linksError) {
      await database
        .from("itinerary_items")
        .delete()
        .in(
          "id",
          data.map(({ id }) => id),
        );
      return { error: mutationError(linksError.message) };
    }
  }

  const orderedItemIds = canonicalActivityOrderIds([...(targetItems ?? []), ...data]);
  const { error: reorderError } = await database.rpc("reorder_itinerary_items", {
    ordered_item_ids: orderedItemIds,
    target_day_id: targetDay.id,
  });
  if (reorderError) {
    await database
      .from("itinerary_items")
      .delete()
      .in(
        "id",
        data.map(({ id }) => id),
      );
    return { error: mutationError(reorderError.message) };
  }

  revalidatePath(`/trips/${parsed.data.tripId}`);
  return {
    data: data.map((item, index) => ({
      ...item,
      links: orderedSources[index].links ?? [],
      sort_order: orderedItemIds.indexOf(item.id),
    })),
  };
}
