import type { OutboxOperation } from "../editing/outbox";
import { SyncFailure } from "../editing/outbox.ts";
import type { ItineraryItem, PlannerDay } from "../itinerary/types";
import { itemEditableSnapshot } from "../itinerary/item-editable-snapshot.ts";
import { bindApplicationChild } from "./application-child-receipt.ts";
import type { ApplicationProjection } from "./application-projection";

const key = (scope: string[], id: string) =>
  `trip-planner:application-receipt:v1:${JSON.stringify(scope.slice(0, 3))}:${id}`;
export function applicationEntityId(
  storage: Storage,
  scope: string[],
  parentId: string,
  entityId: string,
) {
  const bytes = storage.getItem(key(scope, parentId));
  return bytes ? (JSON.parse(bytes) as Receipt).ids?.[entityId] : undefined;
}
type Receipt = {
  baseDaysVersion?: number;
  ids: Record<string, string>;
  pairs: Array<{ preview: ItineraryItem; confirmed: ItineraryItem }>;
  rows: PlannerDay[];
  previewSnapshot?: string;
  confirmedSnapshot?: string;
};
export function readApplicationReceipt(storage: Storage, scope: string[], parentId: string) {
  const bytes = storage.getItem(key(scope, parentId));
  return bytes ? (JSON.parse(bytes) as Receipt) : undefined;
}
const draftAliases = new WeakMap<
  Storage,
  Map<string, { length: number; ids: Map<string, string> }>
>();
export function applicationDraftEntity(storage: Storage, scope: string[], entity: string) {
  const prefix = `trip-planner:application-receipt:v1:${JSON.stringify(scope.slice(0, 3))}:`;
  const cache = draftAliases.get(storage) ?? new Map();
  draftAliases.set(storage, cache);
  let index = cache.get(prefix);
  if (!index || index.length !== storage.length) {
    const ids = new Map<string, string>();
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
      if (!name?.startsWith(prefix)) continue;
      try {
        const receipt = JSON.parse(storage.getItem(name) ?? "null") as Receipt;
        for (const [preview, confirmed] of Object.entries(receipt.ids ?? {}))
          if (preview !== confirmed && !ids.has(confirmed)) ids.set(confirmed, preview);
      } catch {
        /* Preserve corrupt receipt bytes; they cannot rename a draft. */
      }
    }
    index = { length: storage.length, ids };
    cache.set(prefix, index);
  }
  return entity.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (id) => index!.ids.get(id) ?? id,
  );
}

export function saveApplicationReceipt(
  storage: Storage,
  scope: string[],
  id: string,
  projection: ApplicationProjection,
  rows: PlannerDay[],
  sentDaysVersion?: number,
) {
  if (!Array.isArray(rows)) throw new Error("The application after-image could not be recovered.");
  const receipt: Receipt = {
    ids: {},
    pairs: [],
    rows,
    baseDaysVersion: sentDaysVersion ?? projection.baseDaysVersion,
  };
  for (const day of projection.days) {
    const confirmed =
      rows.find((row) => row.id === day.id) ?? rows.find((row) => row.date === day.date);
    if (confirmed) receipt.ids[day.id] = confirmed.id;
  }
  for (const binding of projection.bindings) {
    const preview = projection.items.find((item) => item.id === binding.id)!;
    const candidates = rows
      .flatMap((day) => day.items.map((item) => ({ day, item })))
      .filter(({ day, item }) => {
        const details = item.details as Record<string, unknown>;
        return (
          (details?.ideaResearchItemId === binding.sourceId &&
            Number(details.ideaJourneyIndex ?? 0) === binding.index) ||
          (details?.researchSourceId === binding.sourceId &&
            (binding.action
              ? details.action === binding.action
              : details.segmentIndex !== undefined
                ? Number(details.segmentIndex) === binding.index
                : day.date === binding.date))
        );
      });
    const confirmed =
      candidates.find(({ item }) => item.id === binding.id)?.item ??
      (candidates.length === 1 ? candidates[0].item : undefined);
    if (!confirmed)
      throw new Error("The application item could not be bound safely. Its receipt is retained.");
    receipt.ids[binding.id] = confirmed.id;
    receipt.pairs.push({ preview, confirmed });
  }
  if (projection.previewSnapshot) {
    const preview = JSON.parse(projection.previewSnapshot);
    receipt.previewSnapshot = projection.previewSnapshot;
    receipt.confirmedSnapshot = JSON.stringify([
      preview[0],
      [...rows]
        .sort((a, b) => a.day_number - b.day_number)
        .map((day) => [
          day.id,
          day.day_number,
          day.date,
          day.title,
          day.notes,
          [...day.items]
            .sort((a, b) => a.id.localeCompare(b.id))
            .map((item) => [item.id, itemEditableSnapshot(item), item.sort_order]),
        ]),
      preview[2]
        .filter((route: [string]) =>
          rows.some((day) => day.id === (receipt.ids[route[0]] ?? route[0])),
        )
        .map((route: [string, string[], unknown]) => [
          receipt.ids[route[0]] ?? route[0],
          route[1].map((id) => receipt.ids[id] ?? id),
          route[2],
        ]),
    ]);
  }
  storage.setItem(key(scope, id), JSON.stringify(receipt));
  draftAliases.delete(storage);
}

export function reboundApplicationProjection(
  storage: Storage,
  scope: string[],
  id: string,
  projection: ApplicationProjection,
): ApplicationProjection {
  const bytes = storage.getItem(key(scope, id));
  if (!bytes) return projection;
  const receipt = JSON.parse(bytes) as Receipt;
  return {
    ...projection,
    confirmed: true,
    baseDaysVersion: receipt.baseDaysVersion ?? projection.baseDaysVersion,
    days: receipt.rows.map((day) => ({ ...day, items: [] })),
    items: receipt.pairs.map((pair) => pair.confirmed),
  };
}

/** Bind only unsent child intents against the parent's atomic after-image. */
export function resolveApplicationParents(
  operation: OutboxOperation,
  scope: string[],
  storage: Storage,
): OutboxOperation {
  let intent = structuredClone(operation.intent) as Record<string, unknown>;
  for (const id of operation.dependsOn) {
    const bytes = storage.getItem(key(scope, id));
    if (!bytes) continue;
    const receipt = JSON.parse(bytes) as Receipt;
    if (!receipt.ids || !Array.isArray(receipt.pairs))
      throw new SyncFailure("The application receipt needs recovery.", "conflict");
    for (const pair of receipt.pairs) bindApplicationChild(intent, pair);
    const identityFields = new Set([
      "id",
      "day",
      "day_id",
      "variant_id",
      "item_id",
      "dayId",
      "targetDayId",
      "itemIds",
      "sourceItemIds",
      "replaceTargetItemIds",
      "beforeDays",
      "beforeOrder",
      "orderedDayIds",
      "orderedItemIds",
      "insertAfterItemId",
      "flightEndpointParentId",
    ]);
    const translate = (value: unknown, field = ""): unknown => {
      if (typeof value === "string")
        return identityFields.has(field) ? (receipt.ids[value] ?? value) : value;
      if (Array.isArray(value)) return value.map((entry) => translate(entry, field));
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([name, entry]) => [
            receipt.ids[name] ?? name,
            translate(entry, name),
          ]),
        );
      return value;
    };
    intent = translate(intent) as Record<string, unknown>;
    for (const field of ["beforeItem", "beforeDay"])
      if (typeof intent[field] === "string") {
        const snapshot = translate(JSON.parse(intent[field])) as { items?: Array<{ id: string }> };
        if (field === "beforeDay") snapshot.items?.sort((a, b) => a.id.localeCompare(b.id));
        intent[field] = JSON.stringify(snapshot);
      }
    if (intent.beforeItems)
      intent.beforeItems = Object.fromEntries(
        Object.entries(intent.beforeItems as Record<string, string>).map(([id, snapshot]) => [
          id,
          JSON.stringify(translate(JSON.parse(snapshot))),
        ]),
      );
  }
  return { ...operation, intent: JSON.parse(JSON.stringify(intent)) };
}
