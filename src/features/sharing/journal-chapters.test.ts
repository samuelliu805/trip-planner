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
  assert.deepEqual(journalPreviewIndexes(chapters(Array(12).fill(2))), [2, 5, 9]);
  assert.deepEqual(journalPreviewIndexes(chapters([0, 1, 0])), [0, 1, 2]);
  assert.deepEqual(journalPreviewIndexes([]), []);
});
