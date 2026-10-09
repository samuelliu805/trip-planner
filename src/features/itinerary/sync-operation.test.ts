import assert from "node:assert/strict";
import { test } from "node:test";
import { projectSyncIntent } from "./sync-operation.ts";
import { prepareSyncIntent } from "./prepare-sync-intent.ts";
import { dayIds, dayEditSnapshot, createLocalCopies } from "./structure-sync.ts";
import { itemEditableSnapshot } from "./item-editable-snapshot.ts";
import { mergeConfirmedWorkspace } from "./confirmed-workspace.ts";
import type { PlannerWorkspace, ItineraryItem } from "./types.ts";
import type { PlannerSyncIntent } from "./sync-operation.ts";
import type { OutboxOperation } from "../editing/outbox.ts";
import type { OwnerAttachment } from "../attachments/schema.ts";

const trip = "00000000-0000-4000-8000-000000000001",
  variant = "00000000-0000-4000-8000-000000000002";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const attachment: OwnerAttachment = {
  id: id(90),
  publicRef: "a".repeat(64),
  byteSize: 8,
  createdAt: "2026-10-09",
  draft: false,
  durationSeconds: null,
  fileName: "test.pdf",
  height: null,
  width: null,
  includeInShare: false,
  kind: "pdf",
  mimeType: "application/pdf",
  sortOrder: 0,
  status: "ready",
  version: 1,
};

test("late text ACK and stale refetch cannot resurrect a deleted attachment", () => {
  const confirmed = workspace();
  confirmed.days[0].items[0] = {
    ...confirmed.days[0].items[0],
    version: 2,
    title: "B",
    attachments_version: 4,
    attachments: [],
  };
  const stale = workspace();
  stale.days[0].items[0] = {
    ...stale.days[0].items[0],
    version: 3,
    title: "C",
    attachments_version: 2,
    attachments: [attachment],
  };
  const merged = mergeConfirmedWorkspace(confirmed, stale).days[0].items[0];
  assert.equal(merged.title, "C");
  assert.equal(merged.version, 3);
  assert.equal(merged.attachments_version, 4);
  assert.deepEqual(merged.attachments, []);
});

test("a new upload ACK updates files while preserving a newer text edit", () => {
  const confirmed = workspace(),
    incoming = workspace();
  confirmed.days[0].items[0] = {
    ...confirmed.days[0].items[0],
    version: 5,
    title: "新标题",
    attachments_version: 2,
  };
  incoming.days[0].items[0] = {
    ...incoming.days[0].items[0],
    version: 1,
    attachments_version: 3,
    attachments: [attachment],
  };
  const merged = mergeConfirmedWorkspace(confirmed, incoming).days[0].items[0];
  assert.equal(merged.title, "新标题");
  assert.equal(merged.version, 5);
  assert.equal(merged.attachments_version, 3);
  assert.deepEqual(merged.attachments, [attachment]);
});
function item(n: number, dayId = id(10)): ItineraryItem {
  return {
    id: id(n),
    day_id: dayId,
    trip_id: trip,
    variant_id: variant,
    type: "activity",
    title: `item${n}`,
    details: {},
    notes: null,
    start_time: null,
    end_time: null,
    price_amount: null,
    price_currency: null,
    place_id: null,
    booking_url: null,
    schedule_kind: "none",
    schedule_text: null,
    sort_order: n,
    created_at: "2026-10-09",
    updated_at: "2026-10-09",
    version: 1,
    attachments: [],
    links: [],
  };
}
function workspace(): PlannerWorkspace {
  return {
    variant: {
      id: variant,
      trip_id: trip,
      name: "A",
      color: "#000000",
      is_primary: true,
      version: 1,
      content_version: 1,
      items_version: 1,
      days_version: 1,
    },
    routePlans: [],
    days: [10, 11].map((n, index) => ({
      id: id(n),
      variant_id: variant,
      title: null,
      notes: null,
      date: `2026-10-${10 + index}`,
      day_number: index + 1,
      version: 1,
      content_version: 1,
      items_version: 1,
      items: index === 0 ? [item(20)] : [],
    })),
  };
}
function operation(intent: PlannerSyncIntent): OutboxOperation {
  return {
    id: intent.input.operationId,
    createdAt: 1,
    resources: ["*"],
    dependsOn: [],
    attempts: 0,
    status: "queued",
    intent: JSON.parse(JSON.stringify(intent)),
  };
}

test("a later content read cannot replace newer Plan metadata or a newer route calculation", () => {
  const current = workspace(),
    incoming = workspace();
  current.variant = { ...current.variant, name: "Edited name", version: 3, content_version: 8 };
  incoming.variant = {
    ...incoming.variant,
    name: "Old name",
    version: 2,
    content_version: 9,
    items_version: 2,
  };
  current.routePlans = [
    {
      id: id(60),
      day_id: id(10),
      variant_id: variant,
      version: 2,
      calculation: { version: 4 },
    } as PlannerWorkspace["routePlans"][number],
  ];
  incoming.routePlans = [
    {
      ...current.routePlans[0],
      calculation: { version: 3 },
    } as PlannerWorkspace["routePlans"][number],
  ];
  const merged = mergeConfirmedWorkspace(current, incoming);
  assert.equal(merged.variant.name, "Edited name");
  assert.equal(merged.variant.version, 3);
  assert.equal(merged.variant.content_version, 9);
  assert.equal(merged.variant.items_version, 2);
  assert.equal(merged.routePlans[0].calculation?.version, 4);
  assert.equal(
    mergeConfirmedWorkspace(merged, {
      ...incoming,
      routePlans: [],
      variant: { ...incoming.variant, content_version: 10 },
    }).routePlans.length,
    0,
  );
});

test("insert day projects its stable identity and preserves front insertion dates", () => {
  const original = workspace();
  const intent: PlannerSyncIntent = {
    kind: "insertDay",
    beforeDays: dayIds(original),
    input: {
      tripId: trip,
      variantId: variant,
      beforeDayNumber: 1,
      expectedDaysVersion: 1,
      operationId: id(30),
      stableIdentity: true,
    },
  };
  const projected = projectSyncIntent(original, intent);
  assert.equal(projected.days[0].id, id(30));
  assert.deepEqual(
    projected.days.map((day) => day.date),
    ["2026-10-09", "2026-10-10", "2026-10-11"],
  );
  const create: PlannerSyncIntent = {
    kind: "create",
    input: {
      tripId: trip,
      variantId: variant,
      dayId: id(30),
      operationId: id(31),
      type: "activity",
      title: "New day item",
      expectedItemsVersion: 1,
    },
  };
  assert.equal(projectSyncIntent(projected, create).days[0].items[0].id, id(31));
  assert.throws(() => prepareSyncIntent(operation(create), original), /day was removed/);
  assert.equal(prepareSyncIntent(operation(create), projected).input.operationId, id(31));
});

test("structural changes conflict with foreign day additions instead of dropping them", () => {
  const original = workspace();
  const intent: PlannerSyncIntent = {
    kind: "reorderDays",
    beforeDays: dayIds(original),
    input: {
      tripId: trip,
      variantId: variant,
      operationId: id(30),
      expectedDaysVersion: 1,
      orderedDayIds: dayIds(original).reverse(),
    },
  };
  const latest = {
    ...original,
    days: [...original.days, { ...original.days[0], id: id(40), day_number: 3, items: [] }],
  };
  assert.throws(() => prepareSyncIntent(operation(intent), latest), /structure changed/);
  assert.deepEqual(
    projectSyncIntent(original, intent).days.map((day) => day.id),
    [id(11), id(10)],
  );
});

test("create then edit then delete uses the actual ACK version even for a no-op edit", () => {
  const confirmed = workspace(),
    existing = confirmed.days[0].items[0];
  const intent: PlannerSyncIntent = {
    kind: "delete",
    followsLocal: true,
    beforeItem: itemEditableSnapshot(existing),
    input: {
      id: existing.id,
      tripId: trip,
      variantId: variant,
      operationId: id(30),
      expectedVersion: 3,
      expectedItemsVersion: 1,
    },
  };
  const wire = prepareSyncIntent(operation(intent), confirmed);
  assert.equal(wire.kind, "delete");
  if (wire.kind === "delete") assert.equal(wire.input.expectedVersion, 1);
  const latest = structuredClone(confirmed);
  latest.days[0].items[0].notes = "Someone else's note";
  assert.throws(() => prepareSyncIntent(operation(intent), latest), /changed elsewhere/);
});

test("copy identities survive subsequent editing, and replacement does not remove unrelated items", () => {
  const confirmed = workspace(),
    source = confirmed.days[0].items[0];
  const input = {
    tripId: trip,
    variantId: variant,
    targetDayId: id(11),
    operationId: id(30),
    expectedItemsVersion: 1,
    sourceItemIds: [source.id],
    sourceVersions: [1],
    copiedItemIds: [id(31)],
    replaceTargetItemIds: [],
    replaceTargetVersions: [],
  };
  const copiedItems = createLocalCopies(input, [source]);
  assert.equal(copiedItems[0].id, id(31));
  assert.deepEqual(copiedItems[0].attachments, []);
  const copy: PlannerSyncIntent = {
    kind: "copy",
    input,
    sources: [source],
    replacements: [],
    copiedItems,
  };
  const projected = projectSyncIntent(confirmed, copy);
  const edit: PlannerSyncIntent = {
    kind: "update",
    input: {
      tripId: trip,
      variantId: variant,
      dayId: id(11),
      id: id(31),
      operationId: id(32),
      type: "activity",
      title: "Copied B",
      expectedVersion: 1,
      expectedItemsVersion: 1,
    },
  };
  assert.equal(projectSyncIntent(projected, edit).days[1].items[0].title, "Copied B");
  const foreign = structuredClone(confirmed);
  foreign.days[0].items[0].title = "Foreign edit";
  assert.throws(() => prepareSyncIntent(operation(copy), foreign), /copied or replaced/);
});

test("day deletion rebases only the exact confirmed local content", () => {
  const confirmed = workspace(),
    day = confirmed.days[0];
  const intent: PlannerSyncIntent = {
    kind: "removeDay",
    beforeDays: dayIds(confirmed),
    followsLocal: true,
    beforeDay: dayEditSnapshot(confirmed, day.id),
    input: {
      tripId: trip,
      variantId: variant,
      dayId: day.id,
      operationId: id(30),
      expectedVersion: 2,
      expectedContentVersion: 2,
      expectedDaysVersion: 1,
    },
  };
  const latest = structuredClone(confirmed);
  latest.days[0].content_version = 3;
  const wire = prepareSyncIntent(operation(intent), latest);
  if (wire.kind === "removeDay") assert.equal(wire.input.expectedContentVersion, 3);
  latest.days[0].items.push(item(21));
  assert.throws(() => prepareSyncIntent(operation(intent), latest), /edited elsewhere/);
});
