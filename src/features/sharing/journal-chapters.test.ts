import assert from "node:assert/strict";
import test from "node:test";
import { journalPreviewIndexes } from "./journal-chapters.ts";
import type { PublicItineraryDay } from "./types.ts";

function chapters(counts: number[]) {
  return counts.map((count, index) => ({
    dayNumber: index + 1,
    items: [{ type: "hotel" }, ...Array.from({ length: count }, () => ({ type: "activity" }))],
  })) as PublicItineraryDay[];
}

test("chapter teasers choose activity-rich days in itinerary order", () => {
  assert.deepEqual(journalPreviewIndexes(chapters([0, 3, 0, 0, 4, 0, 0, 5, 0, 0])), [1, 4, 7]);
});

test("ties spread across a long trip and short trips show every chapter", () => {
  assert.deepEqual(journalPreviewIndexes(chapters(Array(12).fill(2))), [0, 5, 11]);
  assert.deepEqual(journalPreviewIndexes(chapters([0, 1, 0])), [0, 1, 2]);
  assert.deepEqual(journalPreviewIndexes([]), []);
});

test("the three richest days win even when consecutive", () => {
  assert.deepEqual(
    journalPreviewIndexes(chapters([2, 2, 2, 8, 7, 6, 2, 2, 2, 2, 2, 2])),
    [3, 4, 5],
  );
  for (let count = 4; count <= 20; count++) {
    const chosen = journalPreviewIndexes(chapters(Array(count).fill(1)));
    assert.equal(chosen.length, 3);
    assert.equal(new Set(chosen).size, 3);
    assert.deepEqual(
      chosen,
      [...chosen].sort((a, b) => a - b),
    );
  }
});

test("town markers do not inflate richness and activities break plan-count ties", () => {
  const days = chapters([0, 2, 2, 1, 0]);
  days[0].items.push(...Array.from({ length: 20 }, () => ({ type: "location" }) as never));
  days[4].items.push({ type: "flight" } as never, { type: "train" } as never);
  assert.deepEqual(journalPreviewIndexes(days), [1, 2, 4]);
});
