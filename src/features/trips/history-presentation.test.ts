import assert from "node:assert/strict";
import test from "node:test";

import { historyEventTitle, presentHistoryChanges } from "./history-presentation.ts";
import {
  historyDetailFilter,
  historyEntryMatchesFilter,
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
    { after: "Autumn in Kyoto", before: "Kyoto", label: "Name" },
    { after: "On", before: "Off", label: "Notes" },
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
        after: "Breakfast (Meal) → Museum (Activity)",
        before: "Museum (Activity) → Breakfast (Meal)",
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
  assert.equal(legacy[0].before, "Unavailable item (Item) → Unavailable item (Item)");
  assert.equal(legacy[0].after, "Unavailable item (Item)");
  assert.doesNotMatch(JSON.stringify(legacy), /00000000/);

  const longOrder = Array.from({ length: 8 }, (_, index) => ({
    name: `Stop ${index + 1}`,
    type: "activity",
  }));
  assert.equal(
    presentHistoryChanges({ order: { after: longOrder, before: [] } })[0].after,
    longOrder.map((item) => `${item.name} (Activity)`).join(" → "),
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
    detail: { field: "email", value: "traveler@example.com" },
    filter: "people",
    trail,
    tripId: cursor.id,
  });
  assert.match(href, /^\/trips\/00000000-0000-4000-8000-000000000001\/history\?/);
  assert.match(decodeURIComponent(href), /filter=people/);
  assert.match(decodeURIComponent(href), /field=email/);
  assert.match(decodeURIComponent(href), /value=traveler@example.com/);
  assert.match(decodeURIComponent(href), /trail=/);
});
