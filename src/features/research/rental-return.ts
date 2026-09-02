import type { ResearchItem } from "./types.ts";

function normalized(value?: string | null) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function rentalReturnsToPickup(item?: ResearchItem) {
  if (!item || item.category !== "rental") return false;
  if (item.origin_place_id && item.origin_place_id === item.destination_place_id) return true;
  const originProviderId =
    item.origin_place?.provider_place_id ?? item.origin_place?.google_place_id;
  const destinationProviderId =
    item.destination_place?.provider_place_id ?? item.destination_place?.google_place_id;
  if (originProviderId || destinationProviderId)
    return Boolean(
      originProviderId &&
      originProviderId === destinationProviderId &&
      item.origin_place?.source === item.destination_place?.source,
    );
  if (item.origin_place_id || item.destination_place_id) return false;
  const origin = normalized(item.origin_text);
  return Boolean(origin && origin === normalized(item.destination_text));
}
