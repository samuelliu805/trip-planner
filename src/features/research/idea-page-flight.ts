import type { ResearchSegment } from "./types.ts";

type Node = Record<string, unknown>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function airport(value: unknown) {
  const node = value && typeof value === "object" ? (value as Node) : null;
  const code = text(node?.iataCode || node?.iata);
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

function localDateTime(value: unknown) {
  const match = text(value).match(
    /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );
  return match ? { date: match[1], time: match[2] } : null;
}

/** Only explicit Flight structured data supplies clock times. */
export function flightPageSegments(nodes: Node[]): ResearchSegment[] {
  return nodes.flatMap((node) => {
    const type = Array.isArray(node["@type"]) ? node["@type"].join(" ") : text(node["@type"]);
    if (!/\bFlight\b/i.test(type)) return [];
    const origin = airport(node.departureAirport);
    const destination = airport(node.arrivalAirport);
    const departure = localDateTime(node.departureTime);
    const arrival = localDateTime(node.arrivalTime);
    if (!origin || !destination || !departure || !arrival) return [];
    const airline =
      node.airline && typeof node.airline === "object" ? (node.airline as Node) : null;
    return [
      {
        origin,
        destination,
        departureDate: departure.date,
        departureTime: departure.time,
        arrivalDate: arrival.date,
        arrivalTime: arrival.time,
        carrier: text(airline?.iataCode) || null,
        serviceNumber: text(node.flightNumber) || null,
      },
    ];
  });
}

export function enrichFlightTimes(
  selected: ResearchSegment[] | undefined,
  page: ResearchSegment[] | undefined,
) {
  if (!selected?.length || !page?.length) return selected;
  return selected.map((segment) => {
    const candidates = page.filter(
      (flight) =>
        flight.origin === segment.origin &&
        flight.destination === segment.destination &&
        flight.departureDate === segment.departureDate &&
        (!segment.carrier || !flight.carrier || segment.carrier === flight.carrier) &&
        (!segment.serviceNumber ||
          !flight.serviceNumber ||
          segment.serviceNumber === flight.serviceNumber),
    );
    if (candidates.length !== 1) return segment;
    return {
      ...segment,
      departureTime: candidates[0].departureTime,
      arrivalDate: candidates[0].arrivalDate,
      arrivalTime: candidates[0].arrivalTime,
    };
  });
}
