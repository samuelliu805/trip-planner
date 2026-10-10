import { stableJson } from "../editing/stable-json";
import type { ResearchItem, StoredResearchPlace } from "./types";

function place(value?: StoredResearchPlace | null, id?: string | null) {
  return value
    ? [
        value.provider_place_id ?? value.google_place_id,
        value.latitude,
        value.longitude,
        value.display_name,
      ]
    : (id ?? null);
}

/** Compare editable data only: resolved place IDs, attachments and observation timestamps are server metadata. */
export function researchEditableSnapshot(item: ResearchItem) {
  return stableJson({
    category: item.category,
    title: item.title ?? null,
    note: item.note ?? null,
    source: item.source_url ?? null,
    price: item.total_price_amount ?? null,
    currency: item.currency ?? null,
    origin: item.origin_text ?? null,
    destination: item.destination_text ?? null,
    location: item.location_text ?? null,
    originPlace: place(item.origin_place, item.origin_place_id),
    destinationPlace: place(item.destination_place, item.destination_place_id),
    locationPlace: place(item.location_place, item.location_place_id),
    startDate: item.start_date ?? null,
    endDate: item.end_date ?? null,
    startTime: item.start_time?.slice(0, 5) ?? null,
    endTime: item.end_time?.slice(0, 5) ?? null,
    journey: item.journey_type ?? null,
    segments: item.segments ?? [],
    links: item.links ?? [],
    adults: item.adult_count ?? null,
    children: item.child_count ?? null,
    rooms: item.room_count ?? null,
    day: item.day_id ?? null,
    context: item.itinerary_item_id ?? null,
  });
}
