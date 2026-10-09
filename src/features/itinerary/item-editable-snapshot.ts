import type { ItineraryItem } from "./types.ts";

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, normalized(entry)]),
    );
  return value;
}

export function itemEditableSnapshot(item: ItineraryItem) {
  return JSON.stringify(
    normalized({
      title: item.title,
      type: item.type,
      day: item.day_id,
      notes: item.notes,
      details: item.details,
      start: item.start_time?.slice(0, 5) ?? null,
      end: item.end_time?.slice(0, 5) ?? null,
      price: item.price_amount,
      currency: item.price_currency,
      placeId: item.place_id,
      booking: item.booking_url,
      links: item.links?.map(({ label, url }) => ({ label, url })) ?? [],
    }),
  );
}
