"use client";
import { SyncFailure } from "../editing/outbox";
import {
  loadPlannerWorkspace,
  createItineraryItem,
  updateItineraryItem,
  deleteItineraryItem,
  clearItineraryItems,
} from "./actions";
import {
  reorderItineraryItems,
  insertTripDay,
  removeTripDay,
  reorderVariantDays,
  copyItineraryItems,
} from "./day-actions";
import type { PlannerSyncIntent } from "./sync-operation";

export async function sendSyncIntent(intent: PlannerSyncIntent) {
  const result =
    intent.kind === "create"
      ? await createItineraryItem(intent.input)
      : intent.kind === "update"
        ? await updateItineraryItem(intent.input)
        : intent.kind === "delete"
          ? await deleteItineraryItem(intent.input)
          : intent.kind === "clear"
            ? await clearItineraryItems(intent.input)
            : intent.kind === "insertDay"
              ? await insertTripDay(intent.input)
              : intent.kind === "removeDay"
                ? await removeTripDay(intent.input)
                : intent.kind === "reorderDays"
                  ? await reorderVariantDays(intent.input)
                  : intent.kind === "copy"
                    ? await copyItineraryItems(intent.input)
                    : await reorderItineraryItems(intent.input);
  if (!result.data)
    throw new SyncFailure(
      result.error ?? "The change could not be synced.",
      result.code === "conflict" ? "conflict" : "failed",
    );
  if (result.sync) {
    if (result.sync.operationId !== intent.input.operationId)
      throw new SyncFailure("The sync confirmation belongs to a different operation.");
    return result.sync;
  }
  const refreshed = await loadPlannerWorkspace(intent.input.tripId, intent.input.variantId);
  if (!refreshed.data)
    throw new SyncFailure(refreshed.error ?? "The saved change could not be confirmed.");
  return refreshed.data;
}
