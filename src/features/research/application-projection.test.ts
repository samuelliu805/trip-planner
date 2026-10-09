import assert from "node:assert/strict";
import { createLocalCopies, dayEditSnapshot, dayIds } from "../itinerary/structure-sync.ts";
import { sourceSnapshot } from "../variants/source-snapshot.ts";
import { resolveApplicationSnapshotParents } from "./application-snapshot-receipt.ts";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { captureApplicationProjection, projectApplication } from "./application-projection.ts";
import { saveApplicationReceipt, resolveApplicationParents } from "./application-receipt.ts";
import { optimisticSavedItem } from "../itinerary/sync-operation.ts";
import { itemEditableSnapshot } from "../itinerary/item-editable-snapshot.ts";
import { prepareSyncIntent } from "../itinerary/prepare-sync-intent.ts";
import type { ResearchItem } from "./types";
import type { PlannerWorkspace } from "../itinerary/types";
import type { OutboxOperation } from "../editing/outbox";

function fixture() {
  const trip = randomUUID(),
    variant = randomUUID(),
    day = randomUUID();
  const workspace = {
    variant: {
      id: variant,
      trip_id: trip,
      version: 1,
      content_version: 1,
      days_version: 1,
      items_version: 1,
      name: "Plan",
      color: "blue",
      is_primary: true,
    },
    routePlans: [],
    days: [
      {
        id: day,
        variant_id: variant,
        day_number: 1,
        date: "2026-10-09",
        title: null,
        notes: null,
        version: 1,
        items_version: 1,
        content_version: 1,
        items: [],
      },
    ],
  } as PlannerWorkspace;
  const source = {
    id: randomUUID(),
    category: "activity",
    trip_id: trip,
    title: "Idea",
    note: null,
    source_url: null,
    start_date: null,
    end_date: null,
    start_time: null,
    end_time: null,
    segments: [],
    total_price_amount: null,
    currency: null,
    location_place_id: null,
    location_text: null,
  } as unknown as ResearchItem;
  return { workspace, source, scope: ["global", randomUUID(), trip, variant] };
}
function memory() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  } as Storage;
}

test("pending application is idempotent and preserves unrelated editing", () => {
  const { workspace, source } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {
    dayId: workspace.days[0].id,
  });
  const unrelated = optimisticSavedItem({
    tripId: workspace.variant.trip_id,
    variantId: workspace.variant.id,
    dayId: workspace.days[0].id,
    operationId: randomUUID(),
    type: "activity",
    title: "Unrelated B",
    details: {},
    expectedItemsVersion: 1,
  });
  workspace.days[0].items.push(unrelated);
  const once = projectApplication(workspace, projection),
    twice = projectApplication(once, projection);
  assert.deepEqual(twice, once);
  assert.deepEqual(
    twice.days[0].items.map((item) => item.title),
    ["Unrelated B", "Idea"],
  );
});

test("atomic receipt binds a pending edit and rejects a subsequent foreign edit", () => {
  const { workspace, source, scope } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {
    dayId: workspace.days[0].id,
  });
  const preview = projection.items[0];
  const confirmed = {
    ...preview,
    id: randomUUID(),
    title: "Canonical title",
    version: 3,
    details: { ideaResearchItemId: source.id, ideaJourneyIndex: 0, location: "Canonical location" },
  };
  workspace.days[0].items = [confirmed];
  workspace.days[0].items_version = 3;
  const storage = memory(),
    parent = randomUUID();
  saveApplicationReceipt(storage, scope, parent, projection, workspace.days);
  const op = {
    id: randomUUID(),
    dependsOn: [parent],
    intent: {
      kind: "update",
      followsLocal: true,
      beforeItem: itemEditableSnapshot(preview),
      input: {
        id: preview.id,
        tripId: workspace.variant.trip_id,
        variantId: workspace.variant.id,
        dayId: preview.day_id,
        operationId: randomUUID(),
        title: "Newer B",
        type: "activity",
        details: { ...(preview.details as object), custom: "B" },
        expectedVersion: 1,
        expectedItemsVersion: 1,
      },
    },
  } as unknown as OutboxOperation;
  const bound = resolveApplicationParents(op, scope, storage);
  const prepared = prepareSyncIntent(bound, workspace);
  assert.equal((prepared.input as { id: string }).id, confirmed.id);
  assert.equal((prepared.input as { title: string }).title, "Newer B");
  assert.deepEqual((prepared.input as { details: unknown }).details, {
    ...confirmed.details,
    custom: "B",
  });
  assert.equal((prepared.input as { expectedVersion: number }).expectedVersion, 3);
  workspace.days[0].items[0] = { ...confirmed, title: "Foreign C", version: 4 };
  assert.throws(() => prepareSyncIntent(bound, workspace), /changed elsewhere/);
  assert.equal((op.intent as { input: { id: string } }).input.id, preview.id);
  assert.equal(
    (
      resolveApplicationParents(op, ["global", "other", scope[2], scope[3]], storage).intent as {
        input: { id: string };
      }
    ).input.id,
    preview.id,
  );
});

test("missing or ambiguous bindings preserve the application receipt for recovery", () => {
  const { workspace, source, scope } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {});
  assert.throws(
    () => saveApplicationReceipt(memory(), scope, randomUUID(), projection, workspace.days),
    /bound safely/,
  );
  const item = projection.items[0];
  workspace.days[0].items = [
    { ...item, id: randomUUID() },
    { ...item, id: randomUUID() },
  ];
  assert.throws(
    () => saveApplicationReceipt(memory(), scope, randomUUID(), projection, workspace.days),
    /bound safely/,
  );
});

test("grouped train preview keeps the final connection arrival and independent rental actions", () => {
  const { workspace, source } = fixture();
  const train = {
    ...source,
    category: "train",
    journey_type: "one_way",
    segments: [
      {
        origin: "A",
        destination: "B",
        departureDate: "2026-10-09",
        arrivalDate: "2026-10-09",
        departureTime: "08:00",
        arrivalTime: "09:00",
        serviceNumber: "T1",
        journeyIndex: 0,
      },
      {
        origin: "B",
        destination: "C",
        departureDate: "2026-10-09",
        arrivalDate: "2026-10-09",
        departureTime: "09:30",
        arrivalTime: "11:00",
        serviceNumber: "T2",
        journeyIndex: 0,
      },
    ],
  } as unknown as ResearchItem;
  const journey = captureApplicationProjection(workspace, [train], {}).items[0];
  assert.equal(journey.start_time, "08:00");
  assert.equal(journey.end_time, "11:00");
  assert.equal((journey.details as { destination: string }).destination, "C");
  const pickup = optimisticSavedItem({
    operationId: randomUUID(),
    tripId: source.trip_id,
    variantId: workspace.variant.id,
    dayId: workspace.days[0].id,
    type: "car_rental",
    title: "Existing pickup",
    details: { action: "pickup" },
    expectedItemsVersion: 1,
  });
  workspace.days[0].items = [pickup];
  const rental = {
    ...source,
    category: "rental",
    start_date: "2026-10-09",
    end_date: "2026-10-09",
  } as ResearchItem;
  const projection = captureApplicationProjection(workspace, [rental], { booking: true });
  assert.equal(projection.items[0].id, pickup.id);
  assert.notEqual(projection.items[1].id, pickup.id);
  assert.equal((projection.items[1].details as { action: string }).action, "return");
});

test("booking calendar fills intermediate and arrival days while preserving occupied tails", () => {
  const { workspace, source } = fixture();
  const flight = {
    ...source,
    category: "flight",
    journey_type: "round_trip",
    start_date: "2026-10-12",
    end_date: "2026-10-15",
    segments: [
      { origin: "A", destination: "B", departureDate: "2026-10-12", arrivalDate: "2026-10-13" },
      { origin: "B", destination: "A", departureDate: "2026-10-15", arrivalDate: "2026-10-16" },
    ],
  } as unknown as ResearchItem;
  const projected = projectApplication(
    workspace,
    captureApplicationProjection(workspace, [flight], { booking: true }),
  );
  assert.deepEqual(
    projected.days.map((day) => day.date),
    ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"],
  );
  assert.deepEqual(
    projected.days.map((day) => day.day_number),
    [1, 2, 3, 4, 5],
  );
  const occupied = {
    ...projected.days[4],
    items: [
      optimisticSavedItem({
        operationId: randomUUID(),
        tripId: source.trip_id,
        variantId: workspace.variant.id,
        dayId: projected.days[4].id,
        type: "note",
        title: "Newer B",
        details: {},
        expectedItemsVersion: 1,
      }),
    ],
  };
  projected.days[4] = occupied;
  const shortened = {
    ...flight,
    segments: [
      { origin: "A", destination: "B", departureDate: "2026-10-12", arrivalDate: "2026-10-13" },
    ],
  } as ResearchItem;
  const preview = projectApplication(
    projected,
    captureApplicationProjection(projected, [shortened], { booking: true, keepExtraDays: true }),
  );
  assert.equal(preview.days.length, 5);
  assert.equal(preview.days[4].items[0].title, "Newer B");
});

test("receipt identity binding never rewrites literal user text or queued wire", () => {
  const { workspace, source, scope } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {
    dayId: workspace.days[0].id,
  });
  const preview = projection.items[0];
  const canonical = { ...preview, id: randomUUID(), version: 2 };
  workspace.days[0].items = [canonical];
  const storage = memory(),
    parent = randomUUID();
  saveApplicationReceipt(storage, scope, parent, projection, workspace.days);
  const operation = {
    id: randomUUID(),
    dependsOn: [parent],
    intent: {
      kind: "update",
      input: {
        id: preview.id,
        dayId: preview.day_id,
        title: preview.id,
        notes: preview.id,
        details: { custom: preview.id },
      },
    },
  } as unknown as OutboxOperation;
  const resolved = resolveApplicationParents(operation, scope, storage).intent as {
    input: { id: string; title: string; notes: string; details: { custom: string } };
  };
  assert.equal(resolved.input.id, canonical.id);
  assert.equal(resolved.input.title, preview.id);
  assert.equal(resolved.input.notes, preview.id);
  assert.equal(resolved.input.details.custom, preview.id);
  assert.equal((operation.intent as { input: { id: string } }).input.id, preview.id);
});

test("a following application rebases its own predecessor after compaction and retains external conflicts", () => {
  const { workspace, source, scope } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {
    dayId: workspace.days[0].id,
  });
  const preview = projection.items[0];
  const pending = projectApplication(workspace, projection);
  const canonical = {
    ...preview,
    id: randomUUID(),
    title: "Canonical A",
    version: 2,
    sort_order: 1,
  };
  workspace.days[0].items = [canonical];
  const storage = memory(),
    parent = randomUUID();
  saveApplicationReceipt(storage, scope, parent, projection, workspace.days);
  const operation = {
    id: randomUUID(),
    dependsOn: [],
    intent: {
      kind: "idea.apply",
      applicationParents: [parent],
      input: { dayId: preview.day_id, beforeItemId: preview.id },
      before: sourceSnapshot(pending),
    },
  } as unknown as OutboxOperation;
  const resolved = resolveApplicationSnapshotParents(operation, scope, storage).intent as {
    before: string;
    input: { beforeItemId: string };
  };
  assert.equal(resolved.before, sourceSnapshot(workspace));
  assert.equal(resolved.input.beforeItemId, canonical.id);
  assert.equal(
    (operation.intent as { input: { beforeItemId: string } }).input.beforeItemId,
    preview.id,
  );
  workspace.days[0].items[0] = { ...canonical, title: "Foreign C", version: 3 };
  assert.notEqual(resolved.before, sourceSnapshot(workspace));
  assert.equal(
    (
      resolveApplicationSnapshotParents(operation, ["global", "other", scope[2]], storage)
        .intent as { before: string }
    ).before,
    sourceSnapshot(pending),
  );
});

test("copy, clear and day removal bind pending application baselines without hiding later edits", () => {
  const { workspace, source, scope } = fixture();
  workspace.days.push({
    ...workspace.days[0],
    id: randomUUID(),
    day_number: 2,
    date: "2026-10-10",
    items: [],
  });
  const projection = captureApplicationProjection(workspace, [source], {
    dayId: workspace.days[0].id,
  });
  const preview = projection.items[0],
    pending = projectApplication(workspace, projection),
    parent = randomUUID(),
    storage = memory();
  const canonical = {
    ...preview,
    id: randomUUID(),
    title: "Canonical A",
    version: 3,
    sort_order: 1,
  };
  workspace.days[0].items = [canonical];
  workspace.days[0].content_version = 3;
  saveApplicationReceipt(storage, scope, parent, projection, workspace.days);
  const input = {
    operationId: randomUUID(),
    tripId: source.trip_id,
    variantId: workspace.variant.id,
    targetDayId: workspace.days[1].id,
    copiedItemIds: [randomUUID()],
    sourceItemIds: [preview.id],
    sourceVersions: [1],
    replaceTargetItemIds: [],
    replaceTargetVersions: [],
    expectedItemsVersion: 1,
  };
  const copy = {
    id: input.operationId,
    dependsOn: [parent],
    intent: {
      kind: "copy",
      input,
      sources: [preview],
      replacements: [],
      copiedItems: createLocalCopies(input, [preview]),
    },
  } as unknown as OutboxOperation;
  const resolved = resolveApplicationParents(copy, scope, storage);
  const prepared = prepareSyncIntent(resolved, workspace);
  assert.ok(prepared.kind === "copy");
  assert.deepEqual(prepared.input.sourceItemIds, [canonical.id]);
  assert.deepEqual(prepared.input.sourceVersions, [3]);
  assert.equal(prepared.copiedItems[0].id, input.copiedItemIds[0]);
  assert.equal(prepared.copiedItems[0].title, canonical.title);
  assert.equal(prepared.copiedItems[0].version, 1);
  const remove = {
    id: randomUUID(),
    dependsOn: [parent],
    intent: {
      kind: "removeDay",
      followsLocal: true,
      beforeDays: dayIds(pending),
      beforeDay: dayEditSnapshot(pending, pending.days[0].id),
      input: {
        operationId: randomUUID(),
        tripId: source.trip_id,
        variantId: workspace.variant.id,
        dayId: pending.days[0].id,
        expectedDaysVersion: 1,
        expectedVersion: 1,
        expectedContentVersion: 1,
      },
    },
  } as unknown as OutboxOperation;
  assert.equal(
    (
      prepareSyncIntent(resolveApplicationParents(remove, scope, storage), workspace).input as {
        expectedContentVersion: number;
      }
    ).expectedContentVersion,
    3,
  );
  const clear = {
    id: randomUUID(),
    dependsOn: [parent],
    intent: {
      kind: "clear",
      followsLocal: true,
      beforeItems: { [preview.id]: itemEditableSnapshot(preview) },
      input: {
        operationId: randomUUID(),
        tripId: source.trip_id,
        variantId: workspace.variant.id,
        itemIds: [preview.id],
        itemVersions: [1],
        expectedItemsVersion: 1,
      },
    },
  } as unknown as OutboxOperation;
  assert.deepEqual(
    (
      prepareSyncIntent(resolveApplicationParents(clear, scope, storage), workspace).input as {
        itemVersions: number[];
      }
    ).itemVersions,
    [3],
  );
  workspace.days[0].items[0] = { ...canonical, title: "Foreign C", version: 4 };
  assert.throws(() => prepareSyncIntent(resolved, workspace), /changed elsewhere/);
});
