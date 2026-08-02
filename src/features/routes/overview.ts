import type { PlannerDay } from "@/features/itinerary/types";
import type { PlannerMapLine } from "@/features/maps/planner-map-canvas";
import { decodeEncodedPolyline } from "../../lib/providers/routes/geo.ts";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";

export type OverviewStageEntry = {
  dayLabel: string;
  dayNumber: number;
  itemId: string;
  title: string;
};

export type OverviewStage = {
  address?: string;
  dayRangeLabel: string;
  entries: OverviewStageEntry[];
  id: string;
  latitude: number;
  longitude: number;
  placeId: string;
  position: number;
};

function rangeLabel(entries: OverviewStageEntry[]) {
  const days = [...new Set(entries.map(({ dayNumber }) => dayNumber))].sort((a, b) => a - b);
  if (days.length === 1) return `Day ${days[0]}`;
  return `Days ${days[0]}–${days.at(-1)}`;
}

/**
 * Builds the lightweight trip overview from explicit City rows only. Missing days
 * are intentionally ignored; no place or intermediate stage is inferred.
 */
export function deriveOverviewStages(days: PlannerDay[]): OverviewStage[] {
  const cityEntries = [...days]
    .sort((a, b) => a.day_number - b.day_number)
    .flatMap((day) =>
      [...day.items]
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((item) => item.type === "location" && item.place)
        .map((item) => ({
          address: item.place?.formattedAddress,
          dayLabel: `Day ${day.day_number}`,
          dayNumber: day.day_number,
          itemId: item.id,
          latitude: item.place!.latitude,
          longitude: item.place!.longitude,
          placeId: item.place!.id,
          title: item.title,
        })),
    );

  const stages: OverviewStage[] = [];
  for (const entry of cityEntries) {
    const previous = stages.at(-1);
    if (previous?.placeId === entry.placeId) {
      previous.entries.push(entry);
      previous.dayRangeLabel = rangeLabel(previous.entries);
      continue;
    }
    const entries = [entry];
    stages.push({
      address: entry.address,
      dayRangeLabel: rangeLabel(entries),
      entries,
      id: `overview:${stages.length + 1}:${entry.placeId}`,
      latitude: entry.latitude,
      longitude: entry.longitude,
      placeId: entry.placeId,
      position: stages.length + 1,
    });
  }
  return stages;
}

export function buildOverviewRouteLines(
  stages: OverviewStage[],
  calculatedLegs: CalculatedRouteLeg[],
): PlannerMapLine[] {
  const calculatedByPosition = new Map(calculatedLegs.map((leg) => [leg.position, leg]));
  return stages.slice(1).flatMap((stage, index) => {
    const position = index + 1;
    const previous = stages[index];
    const calculated = calculatedByPosition.get(position);
    try {
      const path = calculated
        ? calculated.geometry.source === "google"
          ? decodeEncodedPolyline(calculated.geometry.encodedPolyline).map(
              ({ latitude, longitude }) => ({ lat: latitude, lng: longitude }),
            )
          : [
              {
                lat: calculated.geometry.origin.latitude,
                lng: calculated.geometry.origin.longitude,
              },
              {
                lat: calculated.geometry.destination.latitude,
                lng: calculated.geometry.destination.longitude,
              },
            ]
        : [
            { lat: previous.latitude, lng: previous.longitude },
            { lat: stage.latitude, lng: stage.longitude },
          ];
      if (path.length < 2) return [];
      return [
        {
          color: "#166534",
          dashed: !calculated || calculated.geometry.source === "straight",
          id: calculated
            ? `overview-route:${position}:${calculated.legSignature}`
            : `overview-preview:${previous.id}:${stage.id}`,
          path,
        },
      ];
    } catch {
      return [
        {
          color: "#166534",
          dashed: true,
          id: `overview-preview:${previous.id}:${stage.id}`,
          path: [
            { lat: previous.latitude, lng: previous.longitude },
            { lat: stage.latitude, lng: stage.longitude },
          ],
        },
      ];
    }
  });
}
