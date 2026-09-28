import assert from "node:assert/strict";
import { test } from "node:test";

import {
  encodePlannerClipboard,
  parsePlannerClipboard,
  type PlannerClipboard,
} from "./grid-interactions.ts";
import { plannerClipboardOperations } from "./planner-clipboard-paste.ts";
import {
  readStoredPlannerClipboard,
  writeStoredPlannerClipboard,
} from "./planner-clipboard-storage.ts";
import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "./types.ts";
import { rebaseUnchangedCopy } from "./mutation-rebase.ts";

const tripId = "b0000000-0000-4000-8000-000000000001";
const variantA = "b0000000-0000-4000-8000-000000000002";
const variantB = "b0000000-0000-4000-8000-000000000003";
const itemId = "b0000000-0000-4000-8000-000000000004";
const source = { tripId, variantId: variantA };
const item = { id: itemId, type: "activity", version: 7, details: {} } as ItineraryItem;
const workspace = (variantId: string, items: ItineraryItem[]): PlannerWorkspace => ({
  variant: { id: variantId, trip_id: tripId } as PlannerWorkspace["variant"],
  routePlans: [],
  days: [0, 1].map(
    (row) => ({ id: `${variantId}/${row}`, items, items_version: 11 }) as PlannerDay,
  ),
});
const cells: PlannerClipboard = {
  kind: "trip-planner/items",
  version: 2,
  source,
  sourceColumn: 1,
  cells: [{ items: [itemId], rowOffset: 0, columnOffset: 0 }],
};
const copiedItem: PlannerClipboard = {
  kind: "trip-planner/item",
  version: 1,
  source,
  itemId,
  itemType: "activity",
};

test("clipboard source survives serialization and legacy clipboard remains readable", () => {
  for (const payload of [cells, copiedItem])
    assert.deepEqual(parsePlannerClipboard(encodePlannerClipboard(payload)), payload);
  const { source: _source, ...legacy } = cells;
  assert.deepEqual(parsePlannerClipboard(encodePlannerClipboard(legacy)), legacy);
  assert.equal(
    parsePlannerClipboard(JSON.stringify({ ...cells, source: { tripId, variantId: "invalid" } })),
    null,
  );
});

test("a new workspace restores the trip clipboard from tab storage and cannot read another trip", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  writeStoredPlannerClipboard(storage, tripId, cells);
  assert.deepEqual(readStoredPlannerClipboard(storage, tripId), cells);
  assert.equal(readStoredPlannerClipboard(storage, variantB), null);
  writeStoredPlannerClipboard(storage, tripId, copiedItem);
  assert.deepEqual(readStoredPlannerClipboard(storage, tripId), copiedItem);
  writeStoredPlannerClipboard(storage, tripId, {
    ...cells,
    source: { ...source, tripId: variantB },
  });
  assert.equal(readStoredPlannerClipboard(storage, tripId), null);
  writeStoredPlannerClipboard(storage, tripId, cells);
  writeStoredPlannerClipboard(storage, tripId, null);
  assert.equal(readStoredPlannerClipboard(storage, tripId), null);
});

test("unavailable or corrupted tab storage safely falls back", () => {
  assert.equal(readStoredPlannerClipboard({ getItem: () => "not JSON" }, tripId), null);
  assert.equal(
    readStoredPlannerClipboard(
      {
        getItem: () => {
          throw new Error("disabled");
        },
      },
      tripId,
    ),
    null,
  );
  assert.doesNotThrow(() =>
    writeStoredPlannerClipboard(
      {
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => {
          throw new Error("disabled");
        },
      },
      tripId,
      cells,
    ),
  );
});

test("cross-variant cells retain replacement rules and destination day identity", () => {
  const target = workspace(variantB, [{ ...item, id: "existing" }]);
  const operations = plannerClipboardOperations(
    cells,
    { row: 1, column: 1 },
    { row: 1, column: 1 },
    workspace(variantA, [item]),
    target,
  );
  assert.deepEqual(operations, [
    { sourceItemIds: [itemId], targetDay: target.days[1], types: ["activity"] },
  ]);
  assert.throws(
    () =>
      plannerClipboardOperations(
        cells,
        { row: 0, column: 5 },
        { row: 0, column: 5 },
        workspace(variantA, [item]),
        target,
      ),
    /same column/,
  );
  assert.throws(
    () =>
      plannerClipboardOperations(
        cells,
        { row: 0, column: 1 },
        { row: 1, column: 1 },
        workspace(variantA, [item]),
        target,
      ),
    /one row/,
  );
});

test("cross-variant items append to every matching selected day and retain type restrictions", () => {
  const target = workspace(variantB, [{ ...item, id: "existing" }]);
  const operations = plannerClipboardOperations(
    copiedItem,
    { row: 0, column: 1 },
    { row: 1, column: 1 },
    workspace(variantA, [item]),
    target,
  );
  assert.deepEqual(
    operations,
    target.days.map((targetDay) => ({
      sourceItemIds: [itemId],
      targetDay,
      types: ["activity"],
      replaceExisting: false,
    })),
  );
  assert.throws(
    () =>
      plannerClipboardOperations(
        copiedItem,
        { row: 0, column: 5 },
        { row: 0, column: 5 },
        workspace(variantA, [item]),
        target,
      ),
    /matching cells/,
  );
});

test("missing, hidden, or mismatched sources fail before any destination replacement", () => {
  const target = workspace(variantB, [item]);
  for (const payload of [cells, copiedItem]) {
    assert.throws(
      () =>
        plannerClipboardOperations(
          payload,
          { row: 0, column: 1 },
          { row: 0, column: 1 },
          workspace(variantA, []),
          target,
        ),
      /no longer available/,
    );
    const hidden = {
      ...item,
      details: { flightEndpointParentId: "flight", flightEndpointRole: "arrival" },
    };
    assert.throws(
      () =>
        plannerClipboardOperations(
          payload,
          { row: 0, column: 1 },
          { row: 0, column: 1 },
          workspace(variantA, [hidden]),
          target,
        ),
      /no longer available/,
    );
  }
  assert.throws(
    () =>
      plannerClipboardOperations(
        cells,
        { row: 0, column: 1 },
        { row: 0, column: 1 },
        workspace(variantA, [{ ...item, type: "meal" }]),
        target,
      ),
    /does not fit/,
  );
  assert.throws(
    () =>
      plannerClipboardOperations(
        { ...copiedItem, itemType: "meal" },
        { row: 0, column: 1 },
        { row: 0, column: 1 },
        workspace(variantA, [item]),
        target,
      ),
    /no longer available/,
  );
});

test("empty cells keep their clearing operation across variants", () => {
  const target = workspace(variantB, [item]);
  const payload = { ...cells, cells: [{ items: [], rowOffset: 0, columnOffset: 0 }] };
  assert.deepEqual(
    plannerClipboardOperations(
      payload,
      { row: 0, column: 1 },
      { row: 0, column: 1 },
      workspace(variantA, []),
      target,
    ),
    [{ sourceItemIds: [], targetDay: target.days[0], types: ["activity"] }],
  );
});

test("cross-variant copy retry follows a changed destination only while its source is unchanged", () => {
  const target = workspace(variantB, []);
  const input = {
    expectedItemsVersion: 10,
    operationId: tripId,
    sourceItemIds: [itemId],
    sourceVariantId: variantA,
    sourceVersions: [7],
    targetDayId: target.days[0].id,
    tripId,
    variantId: variantB,
  };
  assert.equal(
    rebaseUnchangedCopy(input, target, workspace(variantA, [item]))?.expectedItemsVersion,
    11,
  );
  assert.equal(
    rebaseUnchangedCopy(input, target, workspace(variantA, [{ ...item, version: 8 }])),
    null,
  );
  assert.equal(rebaseUnchangedCopy(input, target, workspace(variantA, [])), null);
  assert.equal(
    rebaseUnchangedCopy(input, { ...target, days: [] }, workspace(variantA, [item])),
    null,
  );
});
