import assert from "node:assert/strict";
import { createLocalCopies, dayEditSnapshot, dayIds } from "../itinerary/structure-sync.ts";
import { sourceSnapshot } from "../variants/source-snapshot.ts";
import { bindApplicationProjectionParents } from "./application-projection-parents.ts";
import { resolveApplicationSnapshotParents } from "./application-snapshot-receipt.ts";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { captureApplicationProjection, projectApplication } from "./application-projection.ts";
import {
  saveApplicationReceipt,
  resolveApplicationParents,
  reboundApplicationProjection,
} from "./application-receipt.ts";
import { optimisticSavedItem } from "../itinerary/sync-operation.ts";
import { itemEditableSnapshot } from "../itinerary/item-editable-snapshot.ts";
import { prepareSyncIntent } from "../itinerary/prepare-sync-intent.ts";
import type { ResearchItem } from "./types";
import type { ItineraryItem, PlannerWorkspace } from "../itinerary/types";
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

test("a following application binds canonical days without duplicating its predecessor", () => {
  const { workspace, source, scope } = fixture();
  source.start_date = "2026-10-10";
  const first = captureApplicationProjection(workspace, [source], {});
  const pending = projectApplication(workspace, first);
  const next = captureApplicationProjection(
    pending,
    [{ ...source, id: randomUUID(), title: "B" }],
    {
      dayId: first.items[0].day_id,
    },
  );
  const frozen = structuredClone(next);
  const storage = memory(),
    parent = randomUUID(),
    canonicalDay = randomUUID();
  const row = { ...first.items[0], id: randomUUID(), day_id: canonicalDay, version: 2 };
  const rows = first.days.map((day) => ({
    ...day,
    id: day.id === first.items[0].day_id ? canonicalDay : day.id,
    items_version: 2,
    items: day.id === first.items[0].day_id ? [row] : [],
  }));
  saveApplicationReceipt(storage, scope, parent, first, rows);
  const bound = bindApplicationProjectionParents(next, [parent], scope, storage);
  const result = projectApplication({ ...workspace, days: rows }, bound);
  assert.deepEqual(next, frozen);
  assert.equal(result.days.length, rows.length);
  assert.deepEqual(
    result.days.find((day) => day.id === canonicalDay)?.items.map((item) => item.title),
    ["Idea", "B"],
  );
  assert.equal(bound.items[0].day_id, canonicalDay);
  assert.ok(!bound.previewSnapshot?.includes(first.items[0].day_id));
});

test("a following replacement receipt rebases later child fields against its canonical preview", () => {
  const { workspace, source, scope } = fixture();
  const first = captureApplicationProjection(workspace, [source], {});
  const storage = memory(),
    parent = randomUUID(),
    child = randomUUID();
  const canonical = {
    ...first.items[0],
    id: randomUUID(),
    version: 2,
    details: { ...(first.items[0].details as object), serverOnly: "A" },
  };
  const rows = [{ ...workspace.days[0], items_version: 2, items: [canonical] }];
  saveApplicationReceipt(storage, scope, parent, first, rows);
  const replacement = structuredClone(first);
  replacement.items[0].title = "B";
  const bound = bindApplicationProjectionParents(replacement, [parent], scope, storage);
  assert.equal(bound.items[0].id, canonical.id);
  assert.equal(bound.bindings[0].id, canonical.id);
  assert.equal(bound.items[0].title, "B");
  assert.equal((bound.items[0].details as Record<string, unknown>).serverOnly, "A");
  const confirmed = {
    ...bound.items[0],
    version: 3,
    details: { ...(bound.items[0].details as object), serverOnly: "B" },
  };
  saveApplicationReceipt(storage, scope, child, bound, [{ ...rows[0], items: [confirmed] }]);
  const operation = {
    intent: {
      kind: "update",
      input: { id: canonical.id, details: { ...(bound.items[0].details as object), local: "C" } },
    },
    dependsOn: [child],
  } as unknown as OutboxOperation;
  const resolved = resolveApplicationParents(operation, scope, storage).intent as {
    input: { details: Record<string, unknown> };
  };
  assert.equal(resolved.input.details.serverOnly, "B");
  assert.equal(resolved.input.details.local, "C");
});

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

test("an atomic application projection retains loaded place and independent attachment data", () => {
  const { workspace, source, scope } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {});
  const placeId = randomUUID();
  const current = {
    ...projection.items[0],
    version: 2,
    place_id: placeId,
    place: {
      id: placeId,
      provider: "google",
      providerPlaceId: "loaded-place",
      displayName: "Loaded place",
      formattedAddress: "Address",
      latitude: 1,
      longitude: 2,
      coordinateSystem: "wgs84",
    },
    attachments_version: 2,
    attachments: [{ id: randomUUID(), fileName: "confirmed.pdf", kind: "pdf", status: "ready" }],
  } as ItineraryItem;
  workspace.days[0].items = [current];
  const atomic = { ...current, title: "Confirmed application", attachments_version: 1 };
  delete atomic.place;
  delete atomic.attachments;
  const rows = [{ ...workspace.days[0], items_version: 2, items: [atomic] }];
  const storage = memory(),
    parent = randomUUID();
  saveApplicationReceipt(storage, scope, parent, projection, rows);
  const rebound = reboundApplicationProjection(storage, scope, parent, projection);
  const projected = projectApplication(workspace, rebound).days[0].items[0];
  assert.equal(projected.title, "Confirmed application");
  assert.deepEqual(projected.place, current.place);
  assert.deepEqual(projected.attachments, current.attachments);
  assert.equal(projected.attachments_version, 2);
  assert.equal(atomic.place, undefined);
  assert.equal(atomic.attachments, undefined);
  assert.equal(
    projectApplication(workspace, { ...rebound, items: [{ ...atomic, place_id: randomUUID() }] })
      .days[0].items[0].place,
    null,
  );
});

test("a retained application ACK cannot replace a newer confirmed item", () => {
  const { workspace, source, scope } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {});
  const atomic = { ...projection.items[0], version: 2 };
  const storage = memory(),
    parent = randomUUID();
  saveApplicationReceipt(storage, scope, parent, projection, [
    { ...workspace.days[0], items_version: 2, items: [atomic] },
  ]);
  const current = { ...atomic, version: 3, title: "Later confirmed B", notes: "B notes" };
  workspace.days[0].items = [current];
  const rebound = reboundApplicationProjection(storage, scope, parent, projection);
  assert.deepEqual(projectApplication(workspace, rebound).days[0].items, [current]);
  assert.equal(
    projectApplication(workspace, projection).days[0].items[0].title,
    source.title,
    "unacknowledged intent remains visible",
  );
});

test("retained application receipts cannot resurrect confirmed day or item deletions", () => {
  const { workspace, source, scope } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {});
  const created = {
    ...workspace.days[0],
    id: randomUUID(),
    day_number: 2,
    date: "2026-10-10",
    items: [],
  };
  projection.days.push(created);
  const atomic = { ...projection.items[0], version: 2 };
  const rows = [
    { ...workspace.days[0], items_version: 2, items: [atomic] },
    { ...created, id: randomUUID() },
  ];
  const storage = memory(),
    parent = randomUUID();
  saveApplicationReceipt(storage, scope, parent, projection, rows);
  const rebound = reboundApplicationProjection(storage, scope, parent, projection);
  assert.equal(
    projectApplication(workspace, rebound).days.length,
    2,
    "the operation's newly created day is visible before refresh",
  );
  workspace.variant.days_version++;
  workspace.days[0] = {
    ...workspace.days[0],
    version: 2,
    items_version: 3,
    date: "2026-11-01",
    items: [],
  };
  const foreign = { ...created, id: randomUUID(), date: "2026-11-02" };
  workspace.days.push(foreign);
  const projected = projectApplication(workspace, rebound);
  assert.deepEqual(
    projected.days.map((day) => day.id),
    workspace.days.map((day) => day.id),
  );
  assert.equal(projected.days[0].date, "2026-11-01");
  assert.deepEqual(projected.days[0].items, []);
});

test("acknowledged structure uses the frozen request baseline after an owned predecessor", () => {
  const { workspace, source, scope } = fixture();
  const projection = captureApplicationProjection(workspace, [source], {});
  const created = {
    ...workspace.days[0],
    id: randomUUID(),
    day_number: 2,
    date: "2026-10-10",
    items: [],
  };
  projection.days.push(created);
  const rows = [
    { ...workspace.days[0], items_version: 2, items: projection.items },
    { ...created, id: randomUUID() },
  ];
  const storage = memory(),
    parent = randomUUID(),
    before = JSON.stringify(projection);
  // A preceding owned insert advanced the baseline before this immutable request was first sent.
  workspace.variant.days_version = 2;
  saveApplicationReceipt(storage, scope, parent, projection, rows, 2);
  const rebound = reboundApplicationProjection(storage, scope, parent, projection);
  const alias = { ...created, id: randomUUID() };
  workspace.days.push(alias);
  assert.equal(rebound.baseDaysVersion, 2);
  assert.ok(
    !projectApplication(workspace, rebound).days.some((day) => day.id === alias.id),
    "the atomic calendar replaces an earlier logical alias",
  );
  assert.equal(projectApplication(workspace, rebound).days.length, 2);
  assert.equal(JSON.stringify(projection), before, "the accepted intent stays immutable");
  workspace.variant.days_version = 3;
  workspace.days = [workspace.days[0]];
  assert.equal(
    projectApplication(workspace, rebound).days.length,
    1,
    "a later confirmed deletion remains authoritative",
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
