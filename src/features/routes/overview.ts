import type { PlannerMapLine } from "@/features/maps/planner-map-canvas";
import { decodeEncodedPolyline } from "../../lib/providers/routes/geo.ts";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import type { PlannerDay } from "@/features/itinerary/types";

import { neighboringCityConflict, orderedCityOccurrences } from "./city-order.ts";

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
  firstDayLabel: string;
  id: string;
  latitude: number;
  longitude: number;
  placeId: string;
  placeKey: string;
  position: number;
};

/**
 * Builds the lightweight trip overview from explicit City rows only. Missing days
 * are intentionally ignored; no place or intermediate stage is inferred.
 */
export function deriveOverviewStages(days: PlannerDay[]): OverviewStage[] {
  return orderedCityOccurrences(days).map((entry, index) => ({
    address: entry.address,
    dayRangeLabel: entry.dayLabel,
    entries: [
      {
        dayLabel: entry.dayLabel,
        dayNumber: entry.dayNumber,
        itemId: entry.itemId,
        title: entry.title,
      },
    ],
    firstDayLabel: entry.dayLabel,
    id: `overview:${index + 1}:${entry.itemId}`,
    latitude: entry.latitude,
    longitude: entry.longitude,
    placeId: entry.placeId,
    placeKey: entry.placeKey,
    position: index + 1,
  }));
}

export function neighboringOverviewCityConflict(stages: OverviewStage[]) {
  return neighboringCityConflict(
    stages.map((stage) => ({
      dayId: "",
      dayLabel: stage.firstDayLabel,
      dayNumber: stage.entries[0].dayNumber,
      itemId: stage.entries[0].itemId,
      latitude: stage.latitude,
      longitude: stage.longitude,
      placeId: stage.placeId,
      placeKey: stage.placeKey,
      sortOrder: stage.position,
      title: stage.entries[0].title,
    })),
  );
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
          position,
          routeLayer: "city",
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
          position,
          routeLayer: "city",
        },
      ];
    }
  });
}
