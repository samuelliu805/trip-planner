import type { ResearchItem, ResearchSegment } from "./types.ts";

type FlightIdea = Pick<
  ResearchItem,
  | "category"
  | "destination_text"
  | "end_date"
  | "journey_type"
  | "origin_text"
  | "segments"
  | "start_date"
  | "title"
>;

export function ideaJourneyPreview(item: FlightIdea) {
  const segments = Array.isArray(item.segments) ? (item.segments as ResearchSegment[]) : [];
  if (item.category !== "flight" && item.category !== "train") return [];
  let groups: ResearchSegment[][];
  if (!segments.length && item.journey_type === "round_trip" && item.end_date) {
    groups = [
      [
        {
          origin: item.origin_text ?? "",
          destination: item.destination_text ?? "",
          departureDate: item.start_date ?? "",
        },
      ],
      [
        {
          origin: item.destination_text ?? "",
          destination: item.origin_text ?? "",
          departureDate: item.end_date,
        },
      ],
    ];
  } else if (segments.length && segments.every((segment) => segment.journeyIndex !== undefined)) {
    const byIndex = new Map<number, ResearchSegment[]>();
    for (const segment of segments) {
      const index = segment.journeyIndex!;
      byIndex.set(index, [...(byIndex.get(index) ?? []), segment]);
    }
    groups = [...byIndex.entries()].sort(([a], [b]) => a - b).map(([, legs]) => legs);
  } else if (item.journey_type === "round_trip" && segments.length > 1) {
    const turn = segments.findIndex(
      (segment, index) => index > 0 && segment.origin === item.destination_text,
    );
    const midpoint = segments.length % 2 === 0 ? segments.length / 2 : -1;
    const repeatedDestination =
      segments.filter((segment) => segment.destination === item.destination_text).length > 1;
    const split = repeatedDestination && midpoint > 0 ? midpoint : turn > 0 ? turn : midpoint;
    groups = split > 0 ? [segments.slice(0, split), segments.slice(split)] : [segments];
  } else groups = item.journey_type === "multi_city" ? segments.map((leg) => [leg]) : [segments];
  return groups
    .filter((legs) => legs.length)
    .map((legs) => ({
      origin: legs[0].origin,
      destination: legs.at(-1)!.destination,
      departureDate: legs[0].departureDate,
      arrivalDate: legs.at(-1)!.arrivalDate ?? legs.at(-1)!.departureDate,
      missingTimes: legs.some((leg) => !leg.departureTime || !leg.arrivalTime),
    }));
}
