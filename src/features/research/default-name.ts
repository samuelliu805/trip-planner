import type { ResearchSegment } from "./types.ts";

export function defaultJourneyIdeaName({
  origin,
  destination,
  departureDate,
  journeyType,
  segments = [],
}: {
  origin?: string | null;
  destination?: string | null;
  departureDate?: string | null;
  journeyType?: string | null;
  segments?: ResearchSegment[];
}) {
  const first = segments[0];
  const start = first?.origin || origin;
  const cities = start ? [start] : [];
  for (const segment of segments) {
    if (segment.origin && segment.origin !== cities.at(-1)) cities.push(segment.origin);
    if (segment.destination && segment.destination !== cities.at(-1))
      cities.push(segment.destination);
  }
  if (!segments.length && destination && destination !== cities.at(-1)) cities.push(destination);
  const directReturn =
    journeyType === "round_trip" &&
    (segments.length === 0 || (cities.length === 3 && cities[0] === cities[2]));
  const route =
    directReturn && cities.length >= 2 ? `${cities[0]} ↔ ${cities[1]}` : cities.join(" → ");
  const date = first?.departureDate || departureDate;
  const timestamp =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
  const label = Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
        .format(timestamp)
        .replace(",", "")
    : null;
  return route ? [route, label].filter(Boolean).join(" ").slice(0, 300) : null;
}
