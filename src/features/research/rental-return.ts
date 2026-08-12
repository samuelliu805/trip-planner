import type { ResearchItem } from "./types.ts";

function normalized(value?: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function rentalReturnsToPickup(item?: ResearchItem) {
  if (!item || item.category !== "rental") return false;
  if (item.origin_place_id && item.origin_place_id === item.destination_place_id) return true;
  const originGoogleId = item.origin_place?.google_place_id;
  const destinationGoogleId = item.destination_place?.google_place_id;
  if (originGoogleId || destinationGoogleId)
    return Boolean(originGoogleId && originGoogleId === destinationGoogleId);
  if (item.origin_place_id || item.destination_place_id) return false;
  const origin = normalized(item.origin_text);
  return Boolean(origin && origin === normalized(item.destination_text));
}
