import assert from "node:assert/strict";
import test from "node:test";

import { historyEventTitle, presentHistoryChanges } from "./history-presentation.ts";
import {
  historyEntryMatchesFilter,
  historyPageHref,
  loadFilteredHistoryPage,
  parseHistoryCursor,
  parseHistoryTrail,
} from "./history-pagination.ts";
import type { TripHistoryEntry } from "../../platform/contracts/trips.ts";

function historyEntry(index: number, eventType: string): TripHistoryEntry {
  return {
    actorLabel: "traveler@example.com",
    changes: {},
    createdAt: new Date(Date.UTC(2026, 8, 8, 12, 0, 60 - index)).toISOString(),
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
        after: "Breakfast (Meal) · Museum (Activity)",
        before: "Museum (Activity) · Breakfast (Meal)",
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
  assert.equal(legacy[0].before, "2 itinerary items");
  assert.equal(legacy[0].after, "1 itinerary item");
  assert.doesNotMatch(JSON.stringify(legacy), /00000000/);
});

test("history filtering fills a page across repository cursors", async () => {
  const firstCursor = historyEntry(2, "member.added");
  const itineraryEntries = [
    historyEntry(3, "itinerary_item.created"),
    historyEntry(4, "itinerary_item.updated"),
    historyEntry(5, "itinerary_item.deleted"),
  ];
  let calls = 0;
  const page = await loadFilteredHistoryPage(
    async () => {
      calls += 1;
      return calls === 1
        ? {
            entries: [historyEntry(1, "member.added"), firstCursor],
            nextCursor: { createdAt: firstCursor.createdAt, id: firstCursor.id },
          }
        : { entries: itineraryEntries, nextCursor: null };
    },
    undefined,
    "itinerary",
    2,
  );
  assert.equal(calls, 2);
  assert.deepEqual(page.entries, itineraryEntries.slice(0, 2));
  assert.deepEqual(page.nextCursor, {
    createdAt: itineraryEntries[1].createdAt,
    id: itineraryEntries[1].id,
  });
  assert.equal(historyEntryMatchesFilter(historyEntry(6, "member.removed"), "people"), true);
  assert.equal(historyEntryMatchesFilter(historyEntry(7, "member.removed"), "sharing"), false);
});

test("history cursor trails round-trip through pagination URLs", () => {
  const cursor = parseHistoryCursor(
    "2026-09-08T12:00:00.000Z",
    "00000000-0000-4000-8000-000000000001",
  );
  assert.ok(cursor);
  const trail = parseHistoryTrail(JSON.stringify([cursor]));
  assert.deepEqual(trail, [cursor]);
  const href = historyPageHref({ cursor, filter: "people", trail, tripId: cursor.id });
  assert.match(href, /^\/trips\/00000000-0000-4000-8000-000000000001\/history\?/);
  assert.match(decodeURIComponent(href), /filter=people/);
  assert.match(decodeURIComponent(href), /trail=/);
});
