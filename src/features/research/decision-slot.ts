import type { ResearchItem } from "./types.ts";

function normalized(value: string | null) {
  return value?.trim().toLowerCase() || "-";
}

export function researchDecisionSlotKey(item: ResearchItem) {
  if (item.itinerary_item_id) return `item:${item.itinerary_item_id}`;
  if (item.day_id) return `day:${item.day_id}:${item.category.toLowerCase()}`;
  return [
    "context",
    item.category.toLowerCase(),
    normalized(item.origin_text),
    normalized(item.destination_text),
    normalized(item.location_text),
    item.start_date ?? "-",
    item.end_date ?? "-",
  ].join(":");
}
