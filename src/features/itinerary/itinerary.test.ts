import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildCopyRows, normalizedTimes, scheduleKind } from "./mutation-helpers.ts";
import { encodePlannerClipboard, fillTargetRows, moveGridFocus, parsePlannerClipboard, selectionBounds, selectionContains } from "./grid-interactions.ts";
import {
  carRentalDetailsSchema,
  copyItineraryItemsSchema,
  createItineraryItemSchema,
  deleteItineraryItemSchema,
  reorderItineraryItemsSchema,
  updateItineraryItemSchema,
} from "./schema.ts";
import type { ItineraryItem } from "./types.ts";

const ids = {
  day: "00000000-0000-4000-8000-000000000003",
  item: "00000000-0000-4000-8000-000000000004",
  targetDay: "00000000-0000-4000-8000-000000000005",
  trip: "00000000-0000-4000-8000-000000000001",
  variant: "00000000-0000-4000-8000-000000000002",
};

const base = { dayId: ids.day, details: {}, title: "Museum", tripId: ids.trip, type: "activity" as const, variantId: ids.variant };

test("create accepts missing, start-only, and end-only time", () => {
  assert.equal(createItineraryItemSchema.safeParse(base).success, true);
  assert.equal(createItineraryItemSchema.safeParse({ ...base, startTime: "09:30" }).success, true);
  assert.equal(createItineraryItemSchema.safeParse({ ...base, endTime: "11:00" }).success, true);
  assert.deepEqual(normalizedTimes("", undefined), { start_time: null, end_time: null });
});

test("edit and delete inputs validate", () => {
  assert.equal(updateItineraryItemSchema.safeParse({ id: ids.item, tripId: ids.trip, title: "Edited", type: "activity" }).success, true);
  assert.equal(updateItineraryItemSchema.safeParse({ endTime: "", id: ids.item, startTime: "", tripId: ids.trip, type: "activity" }).success, true);
  assert.equal(deleteItineraryItemSchema.safeParse({ id: ids.item, tripId: ids.trip }).success, true);
});

test("car rental details require action, location, and confirmed while time/provider remain optional", () => {
  assert.equal(carRentalDetailsSchema.safeParse({ action: "pickup", confirmed: false, location: "Berlin Hbf" }).success, true);
  assert.equal(carRentalDetailsSchema.safeParse({ action: "return", confirmed: true, location: "BER", provider: "Sixt", time: "16:30" }).success, true);
  assert.equal(carRentalDetailsSchema.safeParse({ action: "pickup", confirmed: false }).success, false);
  assert.equal(carRentalDetailsSchema.safeParse({ action: "dropoff", confirmed: false, location: "BER" }).success, false);
});

test("reorder payload persists explicit unique sort orders", () => {
  const parsed = reorderItineraryItemsSchema.parse({ dayId: ids.day, items: [{ id: ids.item, sortOrder: 1 }], tripId: ids.trip });
  assert.deepEqual(parsed.items, [{ id: ids.item, sortOrder: 1 }]);
  assert.equal(reorderItineraryItemsSchema.safeParse({ dayId: ids.day, items: [{ id: ids.item, sortOrder: 0 }, { id: ids.item, sortOrder: 1 }], tripId: ids.trip }).success, false);
});

test("copies get new IDs, destination ordering, and independent values", () => {
  const source = {
    booking_url: "https://example.com", created_at: "2026-01-01", day_id: ids.day, details: { confirmed: true },
    end_time: null, id: ids.item, notes: "Original", place_id: null, schedule_kind: "none", schedule_text: null, sort_order: 2, start_time: null,
    title: "Museum", trip_id: ids.trip, type: "activity", updated_at: "2026-01-01", variant_id: ids.variant,
  } satisfies ItineraryItem;
  const [copy] = buildCopyRows([source], ids.targetDay, 7, true, () => "00000000-0000-4000-8000-000000000006");
  assert.notEqual(copy.id, source.id);
  assert.equal(copy.day_id, ids.targetDay);
  assert.equal(copy.sort_order, 7);
  copy.title = "Independent edit";
  assert.equal(source.title, "Museum");
  assert.equal(copyItineraryItemsSchema.safeParse({ sourceItemIds: [ids.item], targetDayId: ids.targetDay, tripId: ids.trip }).success, true);
});

test("RLS remains the write authority and server actions do not use a service role", async () => {
  const migration = await readFile(new URL("../../../supabase/migrations/20260729160000_initial_schema.sql", import.meta.url), "utf8");
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  assert.match(migration, /itinerary_items_(insert|update|delete)_owners/);
  assert.match(migration, /public\.is_trip_owner\(trip_id\)/);
  assert.doesNotMatch(actions, /service[_-]?role/i);
});

test("schedule metadata follows nullable start and end times", async () => {
  const actions = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  assert.equal(scheduleKind(null, null), "none");
  assert.equal(scheduleKind("09:00", null), "exact");
  assert.equal(scheduleKind(null, "10:00"), "exact");
  assert.equal(scheduleKind("09:00", "10:00"), "range");
  assert.match(actions, /schedule_kind: scheduleKind/);
  assert.match(actions, /values\.schedule_kind = scheduleKind/);
});

test("keyboard navigation wraps rows and clamps to the grid", () => {
  assert.deepEqual(moveGridFocus({ row: 0, column: 0 }, "ArrowRight", 3, 4), { row: 0, column: 1 });
  assert.deepEqual(moveGridFocus({ row: 0, column: 3 }, "Tab", 3, 4), { row: 1, column: 0 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 0 }, "Tab", 3, 4, true), { row: 0, column: 3 });
  assert.deepEqual(moveGridFocus({ row: 0, column: 0 }, "ArrowUp", 3, 4), { row: 0, column: 0 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 1 }, "ArrowDown", 3, 4), { row: 2, column: 1 });
  assert.deepEqual(moveGridFocus({ row: 1, column: 1 }, "ArrowLeft", 3, 4), { row: 1, column: 0 });
});

test("selection extension and fill targets use normalized bounds", () => {
  const anchor = { row: 3, column: 4 };
  const end = { row: 1, column: 2 };
  assert.deepEqual(selectionBounds(anchor, end), { top: 1, bottom: 3, left: 2, right: 4 });
  assert.equal(selectionContains(anchor, end, { row: 2, column: 3 }), true);
  assert.equal(selectionContains(anchor, end, { row: 0, column: 3 }), false);
  assert.deepEqual(fillTargetRows(anchor, end), [2, 3]);
});

test("planner clipboard copy and paste preserves typed item IDs", () => {
  const payload = { cells: [{ columnOffset: 0, items: [ids.item], rowOffset: 0 }], kind: "trip-planner/items" as const, version: 1 as const };
  assert.deepEqual(parsePlannerClipboard(encodePlannerClipboard(payload)), payload);
});

test("malformed and unrelated clipboard input is rejected safely", () => {
  assert.equal(parsePlannerClipboard("not json"), null);
  assert.equal(parsePlannerClipboard(JSON.stringify({ kind: "other", version: 1, cells: [] })), null);
  assert.equal(parsePlannerClipboard(JSON.stringify({ kind: "trip-planner/items", version: 1, cells: [{ rowOffset: -1, columnOffset: 0, items: [ids.item] }] })), null);
});

test("spreadsheet UI uses stable lightweight reorder controls plus rollback hooks", async () => {
  const workspace = await readFile(new URL("./components/planner-workspace.tsx", import.meta.url), "utf8");
  const form = await readFile(new URL("./components/planner-item-form.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  const queries = await readFile(new URL("./queries.ts", import.meta.url), "utf8");
  assert.match(workspace, />Move up /);
  assert.match(workspace, />Move down /);
  assert.match(workspace, /event\.altKey && event\.key === "ArrowUp"/);
  assert.match(workspace, /event\.altKey && event\.key === "ArrowDown"/);
  assert.match(workspace, /aria-label="Fill selected cells down"/);
  assert.match(workspace, /Release to fill/);
  assert.match(workspace, /requestAnimationFrame/);
  assert.match(workspace, /replacedItems/);
  assert.match(workspace, /replaceCategoryItems/);
  assert.match(workspace, /sourceItemIds: sourceDay\.items\.filter/);
  assert.match(workspace, /startRangeSelection/);
  assert.match(workspace, /window\.addEventListener\("pointermove", move\)/);
  assert.match(workspace, /onDoubleClick=\{openEditorFromDoubleClick\}/);
  assert.match(workspace, /data-edit-item=\{item\.id\}/);
  assert.match(workspace, /event\.detail >= 2/);
  assert.match(workspace, />Edit item</);
  assert.match(workspace, /window\.innerWidth < 1200/);
  assert.match(workspace, /data-add-item/);
  assert.match(styles, /aria-selected="true"[\s\S]*data-add-item/);
  assert.match(styles, /aria-selected="true"[\s\S]*display: flex/);
  assert.match(workspace, /Copy selected cells[\s\S]*>Paste</);
  assert.doesNotMatch(workspace, />Fill down</);
  assert.doesNotMatch(workspace, />Duplicate /);
  assert.match(workspace, /setSelectionAnchor\(\{ column: -1, row: -1 \}\)/);
  assert.match(styles, /data-fill-dragging="true"[\s\S]*filter: blur/);
  assert.match(styles, /min-width: 900px[\s\S]*max-width: 1199px/);
  assert.match(styles, /minmax\(0, 56fr\) 4px minmax\(380px, 44fr\)/);
  assert.match(styles, /max-width: 899px[\s\S]*grid-template-rows: minmax\(0, 1fr\) 100px/);
  assert.match(styles, /planner-editor-sheet[\s\S]*max-height: 92dvh/);
  assert.match(styles, /aria-label="Fill selected cells down"[\s\S]*display: none/);
  assert.match(workspace, /h-14[\s\S]*xl:h-\[72px\]/);
  assert.match(workspace, /planner-map-peek/);
  assert.match(workspace, /open=\{mapExpanded\}/);
  assert.match(workspace, /Map and Places activate in Phase 3/);
  assert.match(workspace, /Promise\.all\(replacements\.flatMap/);
  assert.match(workspace, /replacedIds/);
  assert.doesNotMatch(workspace, /DndContext|useSortable|DndDescribedBy/);
  assert.doesNotMatch(workspace, /@\/components\/ui\/popover/);
  assert.match(workspace, /internalClipboard/);
  assert.match(form, /<form/);
  assert.match(form, /type="submit"/);
  assert.match(form, /event\.key === "Escape"/);
  assert.match(form, /Clear start time/);
  assert.match(form, /Clear end time/);
  assert.match(form, /requestAnimationFrame\(\(\) => titleRef\.current\?\.focus\(\)\)/);
  assert.match(queries, /useCopyItineraryItems[\s\S]*onMutate/);
  assert.match(queries, /onError:[\s\S]*context\?\.previous/);
});

test("mobile workspace keeps the matrix editable and uses safe overlay sheets", async () => {
  const workspace = await readFile(new URL("./components/planner-workspace.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /max-width: 639px/);
  assert.match(styles, /safe-area-inset-left/);
  assert.match(styles, /planner-editor-sheet input,[\s\S]*font-size: 16px/);
  assert.match(styles, /planner-map-sheet[\s\S]*height: calc\(100dvh/);
  assert.match(styles, /planner-matrix[\s\S]*touch-action: pan-x pan-y/);
  assert.match(workspace, /selectedMapItem/);
  assert.match(workspace, /contextLabel=\{selectedMapItem\?\.title\}/);
  assert.match(workspace, /planner-map-sheet/);
  assert.match(workspace, /Copy selected cells[\s\S]*>Paste[\s\S]*Copy to days[\s\S]*Copy previous day/);
});
