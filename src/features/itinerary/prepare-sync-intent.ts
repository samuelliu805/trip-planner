import { SyncFailure, type OutboxOperation } from "../editing/outbox.ts";
import { canonicalActivityOrderIds, insertedActivityOrderIds } from "./activity-order.ts";
import { dayEditSnapshot, dayIds } from "./structure-sync.ts";
import { itemEditableSnapshot } from "./item-editable-snapshot.ts";
import type { PlannerSyncIntent } from "./sync-operation.ts";
import type { PlannerWorkspace } from "./types";

function conflict(message: string): never {
  throw new SyncFailure(`${message} Your local edit is kept.`, "conflict");
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Only unsent operations can acquire newer collection versions. Frozen wire payloads bypass this. */
export function prepareSyncIntent(
  operation: OutboxOperation,
  confirmed: PlannerWorkspace,
): PlannerSyncIntent {
  const intent = structuredClone(operation.intent) as unknown as PlannerSyncIntent;
  if (intent.kind === "insertDay" || intent.kind === "removeDay" || intent.kind === "reorderDays") {
    if (!same(intent.beforeDays, dayIds(confirmed)))
      conflict("The day structure changed elsewhere.");
    intent.input.expectedDaysVersion = confirmed.variant.days_version;
    if (intent.kind === "removeDay") {
      const day = confirmed.days.find((day) => day.id === intent.input.dayId);
      if (!day || confirmed.days.length <= 1) conflict("This day cannot be removed.");
      if (intent.followsLocal) {
        if (intent.beforeDay !== dayEditSnapshot(confirmed, day.id))
          conflict("This day was edited elsewhere.");
        intent.input.expectedVersion = day.version;
        intent.input.expectedContentVersion = day.content_version;
      }
    }
    return intent;
  }
  if (intent.kind === "clear") {
    if (intent.followsLocal && intent.beforeItems) {
      for (let index = 0; index < intent.input.itemIds.length; index++) {
        const id = intent.input.itemIds[index];
        const item = confirmed.days.flatMap((day) => day.items).find((item) => item.id === id);
        if (!item || itemEditableSnapshot(item) !== intent.beforeItems[id])
          conflict("A selected item changed elsewhere.");
        intent.input.itemVersions[index] = item.version;
      }
      intent.input.expectedItemsVersion = confirmed.variant.items_version;
    }
    return intent;
  }
  const targetDayId =
    intent.kind === "copy"
      ? intent.input.targetDayId
      : "dayId" in intent.input
        ? intent.input.dayId
        : confirmed.days.find((day) =>
            day.items.some((item) => item.id === (intent.input as { id?: string }).id),
          )?.id;
  const day = confirmed.days.find((day) => day.id === targetDayId);
  if (!day) conflict("The target day was removed.");
  intent.input.expectedItemsVersion = day.items_version;
  if (intent.beforeOrder && !same(canonicalActivityOrderIds(day.items), intent.beforeOrder))
    conflict("This day's order changed elsewhere.");
  if (intent.kind === "copy") {
    const check = (originals: typeof intent.sources, versions: number[]) =>
      originals.forEach((original, index) => {
        // Cross-Plan sources keep their pinned versions; the RPC validates the trip and source rows.
        if (original.variant_id !== confirmed.variant.id) return;
        const current = confirmed.days
          .flatMap((day) => day.items)
          .find((item) => item.id === original.id);
        if (!current || itemEditableSnapshot(current) !== itemEditableSnapshot(original))
          conflict("A copied or replaced item changed elsewhere.");
        versions[index] = current.version;
      });
    check(intent.sources, intent.input.sourceVersions);
    check(intent.replacements, intent.input.replaceTargetVersions ?? []);
    return intent;
  }
  if (intent.kind === "create")
    intent.input.orderedItemIds = insertedActivityOrderIds(
      day.items,
      { id: intent.input.operationId, type: intent.input.type, sort_order: day.items.length },
      intent.input.insertAfterItemId,
    );
  if (intent.kind === "update" || intent.kind === "delete") {
    const item = confirmed.days
      .flatMap((day) => day.items)
      .find((item) => item.id === intent.input.id);
    if (!item) conflict("The edited item was removed.");
    if (intent.followsLocal && intent.beforeItem) {
      if (itemEditableSnapshot(item) !== intent.beforeItem)
        conflict("This item changed elsewhere.");
      intent.input.expectedVersion = item.version;
    }
    if (intent.kind === "update")
      intent.input.orderedItemIds =
        intent.input.insertAfterItemId === undefined
          ? canonicalActivityOrderIds(day.items)
          : insertedActivityOrderIds(
              day.items.filter(({ id }) => id !== item.id),
              { ...item, type: intent.input.type },
              intent.input.insertAfterItemId,
            );
  }
  return intent;
}
