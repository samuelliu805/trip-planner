import assert from "node:assert/strict";
import test from "node:test";

import { historyEventTitle, presentHistoryChanges } from "./history-presentation.ts";
import {
  historyDetailFilter,
  historyEntryMatchesFilter,
  historyFilterOptionValue,
  historyFilterSelection,
  historyPageHref,
  parseHistoryCursor,
  parseHistoryTrail,
} from "./history-pagination.ts";
import type { TripHistoryEntry } from "../../platform/contracts/trips.ts";

function historyEntry(index: number, eventType: string): TripHistoryEntry {
  return {
    actorLabel: "traveler@example.com",
    changes: {},
    createdAt: new Date(Date.UTC(2026, 8, 8, 12, 0, 60 - index)).toISOString(),
    entityType: "itinerary_item",
    eventType,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  };
}

test("history events use approachable action labels", () => {
  assert.equal(historyEventTitle("itinerary_item.created"), "Added an itinerary item");
  assert.equal(historyEventTitle("share_page.created"), "Published a Share Page");
  assert.equal(historyEventTitle("custom_event.saved"), "Custom event saved");
});

test("history details hide implementation fields and never serialize JSON", () => {
  const details = presentHistoryChanges({
    id: { after: "00000000-0000-4000-8000-000000000001", before: null },
    title: { after: "Autumn in Kyoto", before: "Kyoto" },
    showNotes: { after: true, before: false },
    details: { after: { nested: "private implementation payload" }, before: {} },
    version: { after: 2, before: 1 },
  });
  assert.deepEqual(details, [
    {
      after: { kind: "text", text: "Autumn in Kyoto" },
      before: { kind: "text", text: "Kyoto" },
      label: "Name",
    },
    {
      after: { kind: "text", text: "On" },
      before: { kind: "text", text: "Off" },
      label: "Notes",
    },
  ]);
  assert.doesNotMatch(JSON.stringify(details), /private implementation payload/);
});

test("history detail lists stay intentionally short", () => {
  const details = presentHistoryChanges(
    Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [
        `field_${index}`,
        { after: `after ${index}`, before: `before ${index}` },
      ]),
    ),
  );
  assert.equal(details.length, 4);
});

test("order changes show item names and types instead of database IDs", () => {
  assert.deepEqual(
    presentHistoryChanges({
      order: {
        after: [
          { name: "Breakfast", type: "meal" },
          { name: "Museum", type: "activity" },
        ],
        before: [
          { name: "Museum", type: "activity" },
          { name: "Breakfast", type: "meal" },
        ],
      },
    }),
    [
      {
        after: {
          items: [
            { name: "Breakfast", type: "meal", typeLabel: "Meal" },
            { name: "Museum", type: "activity", typeLabel: "Activity" },
          ],
          kind: "order",
        },
        before: {
          items: [
            { name: "Museum", type: "activity", typeLabel: "Activity" },
            { name: "Breakfast", type: "meal", typeLabel: "Meal" },
          ],
          kind: "order",
        },
        label: "Order",
      },
    ],
  );
  const legacy = presentHistoryChanges({
    order: {
      after: ["00000000-0000-4000-8000-000000000001"],
      before: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
    },
  });
  assert.equal(legacy[0].before?.kind, "order");
  assert.deepEqual(legacy[0].before, {
    items: [
      { name: "Unavailable item", type: "item", typeLabel: "Item" },
      { name: "Unavailable item", type: "item", typeLabel: "Item" },
    ],
    kind: "order",
  });
  assert.deepEqual(legacy[0].after, {
    items: [{ name: "Unavailable item", type: "item", typeLabel: "Item" }],
    kind: "order",
  });
  assert.doesNotMatch(JSON.stringify(legacy), /00000000/);

  const longOrder = Array.from({ length: 8 }, (_, index) => ({
    name: `Stop ${index + 1}`,
    type: "activity",
  }));
  assert.deepEqual(presentHistoryChanges({ order: { after: longOrder, before: [] } })[0].after, {
    items: longOrder.map((item) => ({ ...item, typeLabel: "Activity" })),
    kind: "order",
  });

  assert.deepEqual(
    presentHistoryChanges({
      order: {
        after: [
          { name: "Museum", type: "activity" },
          { name: "Subway", type: "transport" },
          { name: "Dinner", type: "meal" },
        ],
      },
    })[0].after,
    {
      items: [
        { name: "Museum", type: "activity", typeLabel: "Activity" },
        { name: "Dinner", type: "meal", typeLabel: "Meal" },
      ],
      kind: "order",
    },
  );
});

test("history presents item and scheduling types as readable labels", () => {
  assert.deepEqual(
    presentHistoryChanges({
      schedule_kind: { after: "all_day", before: "none" },
      type: { after: "meal", before: "activity" },
    }),
    [
      {
        after: { kind: "text", text: "All day" },
        before: { kind: "text", text: "No date / time" },
        label: "Date / Time",
      },
      {
        after: { kind: "item_type", label: "Meal", type: "meal" },
        before: { kind: "item_type", label: "Activity", type: "activity" },
        label: "Type",
      },
    ],
  );
});

test("history filters support exact actor, event, entity, and changed-field values", () => {
  const entry = { ...historyEntry(1, "itinerary_item.updated"), changes: { title: {} } };
  assert.equal(historyEntryMatchesFilter(entry, "itinerary"), true);
  assert.equal(historyEntryMatchesFilter(entry, "sharing"), false);
  assert.equal(
    historyEntryMatchesFilter(entry, "all", { field: "email", value: "TRAVELER@example.com" }),
    true,
  );
  assert.equal(
    historyEntryMatchesFilter(entry, "all", { field: "event", value: entry.eventType }),
    true,
  );
  assert.equal(
    historyEntryMatchesFilter(entry, "all", { field: "entity", value: entry.entityType }),
    true,
  );
  assert.equal(
    historyEntryMatchesFilter(entry, "all", { field: "changed_field", value: "TITLE" }),
    true,
  );
  assert.equal(historyEntryMatchesFilter(entry, "all", { field: "email", value: "" }), false);
  assert.deepEqual(historyDetailFilter("email", " traveler@example.com "), {
    field: "email",
    value: "traveler@example.com",
  });
  assert.deepEqual(historyDetailFilter("unknown", "value"), { field: "all", value: "value" });
});

test("history cursor trails round-trip through pagination URLs", () => {
  const cursor = parseHistoryCursor(
    "2026-09-08T12:00:00.000Z",
    "00000000-0000-4000-8000-000000000001",
  );
  assert.ok(cursor);
  const trail = parseHistoryTrail(JSON.stringify([cursor]));
  assert.deepEqual(trail, [cursor]);
  const href = historyPageHref({
    cursor,
    selection: historyFilterSelection(historyFilterOptionValue("email", "traveler@example.com")),
    trail,
    tripId: cursor.id,
  });
  assert.match(href, /^\/trips\/00000000-0000-4000-8000-000000000001\/history\?/);
  assert.match(decodeURIComponent(href), /filter=email:traveler%40example.com/);
  assert.doesNotMatch(decodeURIComponent(href), /field=/);
  assert.doesNotMatch(decodeURIComponent(href), /value=/);
  assert.match(decodeURIComponent(href), /trail=/);
});

test("one filter value selects categories or exact server-provided options", () => {
  assert.deepEqual(historyFilterSelection("itinerary"), {
    category: "itinerary",
    detail: { field: "all", value: "" },
    value: "itinerary",
  });
  assert.deepEqual(historyFilterSelection("email:traveler%40example.com"), {
    category: "all",
    detail: { field: "email", value: "traveler@example.com" },
    value: "email:traveler%40example.com",
  });
  assert.deepEqual(historyFilterSelection("email:%E0%A4%A"), {
    category: "all",
    detail: { field: "all", value: "" },
    value: "all",
  });
});
