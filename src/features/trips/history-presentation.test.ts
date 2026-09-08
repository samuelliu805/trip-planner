import assert from "node:assert/strict";
import test from "node:test";

import { historyEventTitle, presentHistoryChanges } from "./history-presentation.ts";

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
