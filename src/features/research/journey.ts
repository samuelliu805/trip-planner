import type { ResearchSegment } from "./types.ts";

export function defaultFlightArrivalDate(segment: ResearchSegment): ResearchSegment {
  return { ...segment, arrivalDate: segment.arrivalDate || segment.departureDate };
}

export function changeSegmentDepartureDate(
  segment: ResearchSegment,
  departureDate: string,
  defaultSameDayArrival: boolean,
): ResearchSegment {
  const followsDeparture =
    !segment.arrivalDate ||
    (!segment.departureTime &&
      !segment.arrivalTime &&
      segment.arrivalDate === segment.departureDate);
  return {
    ...segment,
    departureDate,
    ...(defaultSameDayArrival && followsDeparture ? { arrivalDate: departureDate } : {}),
  };
}

function blankSegment(origin = "", destination = ""): ResearchSegment {
  return {
    arrivalDate: "",
    arrivalTime: "",
    carrier: "",
    departureDate: "",
    departureTime: "",
    destination,
    origin,
    serviceNumber: "",
  };
}

export function initialResearchSegments({
  category = "flight",
  destination,
  endDate,
  origin,
  segments,
  startDate,
}: {
  category?: "flight" | "train";
  destination?: string | null;
  endDate?: string | null;
  origin?: string | null;
  segments?: ResearchSegment[];
  startDate?: string | null;
}) {
  if (segments?.length)
    return category === "flight" ? segments.map(defaultFlightArrivalDate) : segments;
  const outbound = {
    ...blankSegment(origin ?? "", destination ?? ""),
    departureDate: startDate ?? "",
  };
  const initial = endDate
    ? [outbound, { ...blankSegment(destination ?? "", origin ?? ""), departureDate: endDate }]
    : [outbound];
  return category === "flight" ? initial.map(defaultFlightArrivalDate) : initial;
}
