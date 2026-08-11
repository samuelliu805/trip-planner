import type { ResearchCategory, ResearchItem } from "./types";

const commonRequired: Array<keyof ResearchItem> = ["total_price_amount", "currency"];

const categoryRequired: Record<ResearchCategory, Array<keyof ResearchItem>> = {
  flight: ["origin_text", "destination_text", "start_date"],
  rental: ["origin_text", "start_date", "end_date"],
  stay: ["location_text", "start_date", "end_date"],
  train: ["origin_text", "destination_text", "start_date"],
};

const fieldLabels: Partial<Record<keyof ResearchItem, string>> = {
  currency: "price",
  destination_text: "destination",
  end_date: "dates",
  location_text: "location",
  origin_text: "origin",
  start_date: "dates",
  total_price_amount: "price",
};

export function missingComparisonFields(item: ResearchItem) {
  const fields = [...commonRequired, ...categoryRequired[item.category as ResearchCategory]];
  const missing = [
    ...new Set(fields.filter((field) => item[field] === null).map((field) => fieldLabels[field])),
  ].filter((label): label is string => Boolean(label));
  if (["flight", "train"].includes(item.category) && item.journey_type) {
    const segments = Array.isArray(item.segments) ? item.segments : [];
    const expected = item.journey_type === "one_way" ? 1 : 2;
    if (
      segments.length < expected ||
      segments.some((segment) => {
        if (!segment || typeof segment !== "object" || Array.isArray(segment)) return true;
        const values = segment as Record<string, unknown>;
        return (
          !String(values.origin ?? "").trim() ||
          !String(values.destination ?? "").trim() ||
          !String(values.departureDate ?? "").trim()
        );
      })
    )
      missing.push(item.category === "flight" ? "flight segments" : "train details");
  }
  return [...new Set(missing)];
}

export function isReadyToCompare(item: ResearchItem) {
  return missingComparisonFields(item).length === 0;
}

export function stayNightCount(item: ResearchItem) {
  if (item.category !== "stay" || !item.start_date || !item.end_date) return null;
  const start = Date.parse(`${item.start_date}T00:00:00Z`);
  const end = Date.parse(`${item.end_date}T00:00:00Z`);
  const nights = Math.round((end - start) / 86_400_000);
  return nights > 0 ? nights : null;
}

export function stayPerNightPrice(item: ResearchItem) {
  const nights = stayNightCount(item);
  return nights && item.total_price_amount !== null ? item.total_price_amount / nights : null;
}

export function researchContextLabel(item: ResearchItem) {
  const dates = item.start_date
    ? item.end_date
      ? `${formatDate(item.start_date)}–${formatDate(item.end_date)}`
      : formatDate(item.start_date)
    : null;
  if (item.category === "stay")
    return [item.location_text ?? "Stay ideas", dates].filter(Boolean).join(" · ");
  if (item.category === "rental")
    return [
      item.origin_text
        ? item.destination_text
          ? `${item.origin_text} → ${item.destination_text}`
          : `Pick-up: ${item.origin_text}`
        : "Rental ideas",
      dates,
    ]
      .filter(Boolean)
      .join(" · ");
  return item.origin_text && item.destination_text
    ? `${item.origin_text} → ${item.destination_text}`
    : item.category === "flight"
      ? "Flight ideas"
      : "Train ideas";
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}
