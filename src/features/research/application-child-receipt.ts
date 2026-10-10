import type { ItineraryItem } from "../itinerary/types";
import { itemEditableSnapshot } from "../itinerary/item-editable-snapshot.ts";
function editableJson(value: unknown): string {
  const sorted = (entry: unknown): unknown =>
    Array.isArray(entry)
      ? entry.map(sorted)
      : entry && typeof entry === "object"
        ? Object.fromEntries(
            Object.entries(entry)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, val]) => [key, sorted(val)]),
          )
        : entry;
  return JSON.stringify(sorted(value));
}

export function overlayApplicationFields(base: unknown, before: unknown, after: unknown): unknown {
  if (JSON.stringify(before) === JSON.stringify(after)) return base;
  if (
    before &&
    after &&
    base &&
    typeof before === "object" &&
    typeof after === "object" &&
    typeof base === "object" &&
    !Array.isArray(after)
  ) {
    const result = { ...(base as object) } as Record<string, unknown>;
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!Object.hasOwn(after, name)) delete result[name];
      else
        result[name] = overlayApplicationFields(
          (base as Record<string, unknown>)[name],
          (before as Record<string, unknown>)[name],
          (after as Record<string, unknown>)[name],
        );
    }
    return result;
  }
  return after;
}

export function bindApplicationChild(
  intent: Record<string, unknown>,
  pair: { preview: ItineraryItem; confirmed: ItineraryItem },
) {
  const input = intent.input as Record<string, unknown>;
  if (input?.id === pair.preview.id && intent.kind === "update") {
    if (input.details !== undefined)
      input.details = overlayApplicationFields(
        pair.confirmed.details,
        pair.preview.details,
        input.details,
      );
    for (const [name, column] of [
      ["title", "title"],
      ["notes", "notes"],
      ["startTime", "start_time"],
      ["endTime", "end_time"],
      ["priceAmount", "price_amount"],
      ["priceCurrency", "price_currency"],
      ["placeId", "place_id"],
      ["bookingUrl", "booking_url"],
    ]) {
      const before = pair.preview[column as keyof ItineraryItem];
      if (input[name] !== undefined && input[name] === before)
        input[name] = pair.confirmed[column as keyof ItineraryItem];
    }
  }
  if (intent.beforeItem && input?.id === pair.preview.id) {
    intent.beforeItem = editableJson(
      overlayApplicationFields(
        JSON.parse(itemEditableSnapshot(pair.confirmed)),
        JSON.parse(itemEditableSnapshot(pair.preview)),
        JSON.parse(String(intent.beforeItem)),
      ),
    );
  }
  const beforeItems = intent.beforeItems as Record<string, string> | undefined;
  if (beforeItems?.[pair.preview.id])
    beforeItems[pair.preview.id] = editableJson(
      overlayApplicationFields(
        JSON.parse(itemEditableSnapshot(pair.confirmed)),
        JSON.parse(itemEditableSnapshot(pair.preview)),
        JSON.parse(beforeItems[pair.preview.id]),
      ),
    );
  for (const field of ["sources", "replacements"]) {
    const items = intent[field] as ItineraryItem[] | undefined;
    items?.forEach((source, index) => {
      if (source.id !== pair.preview.id) return;
      items[index] = overlayApplicationFields(
        pair.confirmed,
        pair.preview,
        source,
      ) as ItineraryItem;
      if (field === "sources" && intent.kind === "copy" && source.version === pair.preview.version)
        (input.sourceVersions as number[])[index] = pair.confirmed.version;
      if (field === "sources" && intent.kind === "copy") {
        const copies = intent.copiedItems as ItineraryItem[];
        if (copies[index])
          copies[index] = {
            ...(overlayApplicationFields(
              pair.confirmed,
              pair.preview,
              copies[index],
            ) as ItineraryItem),
            id: copies[index].id,
            day_id: copies[index].day_id,
            version: copies[index].version,
            attachments: copies[index].attachments,
          };
      }
    });
  }
  if (typeof intent.beforeDay === "string") {
    const day = JSON.parse(intent.beforeDay);
    for (const row of day?.items ?? [])
      if (row.id === pair.preview.id) {
        row.fields = editableJson(
          overlayApplicationFields(
            JSON.parse(itemEditableSnapshot(pair.confirmed)),
            JSON.parse(itemEditableSnapshot(pair.preview)),
            JSON.parse(row.fields),
          ),
        );
        if (row.order === pair.preview.sort_order) row.order = pair.confirmed.sort_order;
      }
    intent.beforeDay = JSON.stringify(day);
  }
}
