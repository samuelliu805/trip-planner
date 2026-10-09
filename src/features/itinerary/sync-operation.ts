import type { Json } from "@/types/database";
import type {
  CreateItineraryItemInput,
  UpdateItineraryItemInput,
  DeleteItineraryItemInput,
} from "./item-schema";
import type { ReorderItineraryItemsInput, ClearItineraryItemsInput } from "./day-schema";
import type { ItineraryItem, PlannerWorkspace } from "./types";
import { insertActivityAtPlacement } from "./activity-order.ts";
import { normalizedScheduleEndTime, scheduleKind } from "./mutation-helpers.ts";
import { placeSnapshotFromJson } from "../../lib/providers/places/types.ts";
import { removeItem, removeItems, replaceItem } from "./query-cache.ts";
import {
  projectStructureIntent,
  isStructureIntent,
  type StructureSyncIntent,
} from "./structure-sync.ts";

export type PlannerSyncIntent = (
  | { kind: "create"; input: CreateItineraryItemInput }
  | { kind: "update"; input: UpdateItineraryItemInput }
  | { kind: "delete"; input: DeleteItineraryItemInput }
  | { kind: "clear"; input: ClearItineraryItemsInput }
  | { kind: "reorder"; input: ReorderItineraryItemsInput }
  | StructureSyncIntent
) & {
  beforeOrder?: string[];
  beforeItem?: string;
  beforeItems?: Record<string, string>;
  followsLocal?: boolean;
};

export function intentItemIds(intent: PlannerSyncIntent) {
  if (intent.kind === "insertDay") return [intent.input.operationId];
  if (intent.kind === "removeDay") return [intent.input.dayId];
  if (intent.kind === "reorderDays") return [];
  if (intent.kind === "copy")
    return [
      ...intent.input.sourceItemIds,
      ...(intent.input.replaceTargetItemIds ?? []),
      ...(intent.input.copiedItemIds ?? []),
    ];
  if (intent.kind === "create") return [intent.input.operationId];
  if (intent.kind === "clear") return intent.input.itemIds;
  if (intent.kind === "reorder") return intent.input.items.map(({ id }) => id);
  return [intent.input.id];
}

export function optimisticSavedItem(
  input: CreateItineraryItemInput | UpdateItineraryItemInput,
  existing?: ItineraryItem,
): ItineraryItem {
  const id = "id" in input ? input.id : input.operationId;
  const place = placeSnapshotFromJson(input.placeSnapshot);
  const startTime =
    input.startTime === undefined ? (existing?.start_time ?? null) : input.startTime || null;
  const details = input.details ?? existing?.details ?? {};
  const endTime = normalizedScheduleEndTime(
    input.type,
    details,
    startTime,
    input.endTime === undefined ? existing?.end_time : input.endTime,
  );
  const timestamp = new Date().toISOString();
  return {
    ...existing,
    id,
    day_id: input.dayId ?? existing!.day_id,
    trip_id: input.tripId,
    variant_id: input.variantId,
    title: input.title?.trim() ?? existing!.title,
    type: input.type,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
    version: (existing?.version ?? 0) + 1,
    details: details as Json,
    start_time: startTime,
    end_time: endTime,
    schedule_kind: scheduleKind(startTime, endTime),
    schedule_text: existing?.schedule_text ?? null,
    notes: input.notes === undefined ? (existing?.notes ?? null) : input.notes || null,
    price_amount:
      input.priceAmount === undefined ? (existing?.price_amount ?? null) : input.priceAmount,
    price_currency:
      input.priceAmount === null ? null : (input.priceCurrency ?? existing?.price_currency ?? null),
    booking_url:
      input.links !== undefined
        ? (input.links[0]?.url ?? null)
        : input.bookingUrl !== undefined
          ? input.bookingUrl || null
          : (existing?.booking_url ?? null),
    links:
      input.links?.map((link, sort_order) => ({
        ...link,
        sort_order,
        item_id: id,
        id: `${id}:link:${sort_order}`,
      })) ??
      existing?.links ??
      [],
    attachments: existing?.attachments ?? [],
    place_id: input.placeId === undefined ? (existing?.place_id ?? null) : input.placeId,
    place:
      input.placeSnapshot !== undefined
        ? place
          ? { ...place, id: input.placeId ?? id }
          : null
        : input.placeId === null
          ? null
          : (existing?.place ?? null),
    sort_order: existing?.sort_order ?? 0,
  };
}

export function projectSyncIntent(
  workspace: PlannerWorkspace,
  intent: PlannerSyncIntent,
): PlannerWorkspace {
  if (isStructureIntent(intent)) return projectStructureIntent(workspace, intent);
  if (intent.kind === "delete") return removeItem(workspace, intent.input.id)!;
  if (intent.kind === "clear") return removeItems(workspace, intent.input.itemIds)!;
  if (intent.kind === "reorder") {
    const orders = new Map(intent.input.items.map(({ id, sortOrder }) => [id, sortOrder]));
    return {
      ...workspace,
      days: workspace.days.map((day) =>
        day.id === intent.input.dayId
          ? {
              ...day,
              items: day.items.map((item) => ({
                ...item,
                sort_order: orders.get(item.id) ?? item.sort_order,
              })),
            }
          : day,
      ),
    };
  }
  const existing =
    intent.kind === "update"
      ? workspace.days.flatMap(({ items }) => items).find(({ id }) => id === intent.input.id)
      : undefined;
  if (intent.kind === "update" && !existing) return workspace;
  const item = optimisticSavedItem(intent.input, existing);
  const next = replaceItem(workspace, item)!;
  if (intent.kind === "update" && intent.input.insertAfterItemId === undefined) return next;
  return {
    ...next,
    days: next.days.map((day) =>
      day.id === item.day_id
        ? {
            ...day,
            items: insertActivityAtPlacement(day.items, item, intent.input.insertAfterItemId),
          }
        : day,
    ),
  };
}
