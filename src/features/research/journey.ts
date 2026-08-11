import type { ResearchSegment } from "./types.ts";

function blankSegment(origin = "", destination = ""): ResearchSegment {
  return {
    arrivalDate: "",
    arrivalTime: "",
    departureDate: "",
    departureTime: "",
    destination,
    origin,
    serviceNumber: "",
  };
}

export function initialResearchSegments({
  destination,
  endDate,
  origin,
  segments,
  startDate,
}: {
  destination?: string | null;
  endDate?: string | null;
  origin?: string | null;
  segments?: ResearchSegment[];
  startDate?: string | null;
}) {
  if (segments?.length) return segments;
  const outbound = {
    ...blankSegment(origin ?? "", destination ?? ""),
    departureDate: startDate ?? "",
  };
  return endDate
    ? [outbound, { ...blankSegment(destination ?? "", origin ?? ""), departureDate: endDate }]
    : [outbound];
}
