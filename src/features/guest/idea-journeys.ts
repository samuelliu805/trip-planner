import type { ResearchSegment } from "../research/types.ts";
import type { GuestIdea } from "./schema.ts";

export type GuestJourney = {
  arrivalDate: string | null;
  arrivalTime: string | null;
  departureDate: string | null;
  departureTime: string | null;
  destination: string | null;
  origin: string | null;
  segments: ResearchSegment[];
  serviceNumber: string | null;
};

export function guestIdeaJourneys(idea: GuestIdea): GuestJourney[] {
  const value = idea.values;
  const segments = value.segments ?? [];
  if (value.category !== "flight" && value.category !== "train")
    return [
      {
        arrivalDate: value.endDate ?? null,
        arrivalTime: value.endTime ?? null,
        departureDate: value.startDate ?? null,
        departureTime: value.startTime ?? null,
        destination: value.destinationText ?? null,
        origin: value.originText ?? null,
        segments: [],
        serviceNumber: null,
      },
    ];

  let groups: ResearchSegment[][] = [];
  if (segments.length) {
    const allMarked = segments.every((segment) => segment.journeyIndex !== undefined);
    if (allMarked) {
      const byIndex = new Map<number, ResearchSegment[]>();
      for (const segment of segments)
        byIndex.set(segment.journeyIndex!, [
          ...(byIndex.get(segment.journeyIndex!) ?? []),
          segment,
        ]);
      groups = [...byIndex.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, legs]) => legs);
    } else if (value.journeyType === "round_trip") {
      const turn = segments.findIndex(
        (segment, index) => index > 0 && segment.origin === value.destinationText,
      );
      const fallback = segments.length % 2 === 0 ? segments.length / 2 : -1;
      const destinationVisits = segments.filter(
        (segment) => segment.destination === value.destinationText,
      ).length;
      const split = destinationVisits > 1 && fallback > 0 ? fallback : turn > 0 ? turn : fallback;
      if (split < 1) throw new Error("Review the outbound and return flight routes.");
      groups = [segments.slice(0, split), segments.slice(split)];
    } else groups = value.journeyType === "multi_city" ? segments.map((leg) => [leg]) : [segments];
  } else if (value.journeyType === "round_trip" && value.endDate) {
    groups = [
      [
        {
          origin: value.originText ?? "",
          destination: value.destinationText ?? "",
          departureDate: value.startDate ?? "",
        },
      ],
      [
        {
          origin: value.destinationText ?? "",
          destination: value.originText ?? "",
          departureDate: value.endDate,
        },
      ],
    ];
  } else
    groups = [
      [
        {
          origin: value.originText ?? "",
          destination: value.destinationText ?? "",
          departureDate: value.startDate ?? "",
          departureTime: value.startTime,
          arrivalTime: value.endTime,
        },
      ],
    ];

  const journeys = groups.map((legs): GuestJourney => {
    const first = legs[0];
    const last = legs.at(-1)!;
    return {
      arrivalDate: last.arrivalDate || last.departureDate || null,
      arrivalTime: last.arrivalTime || null,
      departureDate: first.departureDate || null,
      departureTime: first.departureTime || null,
      destination: last.destination || null,
      origin: first.origin || null,
      segments: legs,
      serviceNumber:
        legs
          .map((leg) => [leg.carrier, leg.serviceNumber].filter(Boolean).join(" "))
          .filter(Boolean)
          .join(" / ") || null,
    };
  });
  if (
    value.journeyType === "round_trip" &&
    (journeys.length !== 2 ||
      !journeys[0].origin ||
      journeys[0].origin === journeys[0].destination ||
      journeys[0].destination !== journeys[1].origin ||
      journeys[1].destination !== journeys[0].origin ||
      !journeys.every((journey) => journey.departureDate))
  )
    throw new Error("Review the outbound and return flight routes.");
  return journeys;
}
