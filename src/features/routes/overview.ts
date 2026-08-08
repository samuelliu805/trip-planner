import type { PlannerMapLine } from "@/features/maps/planner-map-model";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import type { PlannerDay } from "@/features/itinerary/types";
import { decodeEncodedPolyline } from "../../lib/providers/routes/geo.ts";
import { compareManualDayOrder, deriveDayOverviewClusters } from "../itinerary/locality.ts";

import { neighboringCityConflict, type CityOccurrence } from "./city-order.ts";

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

export function deriveOverviewStagesFromOccurrences(
  occurrences: CityOccurrence[],
  stageId: (entry: CityOccurrence, position: number) => string = (entry, position) =>
    `overview:${position}:${entry.itemId}`,
): OverviewStage[] {
  return occurrences.map((entry, index) => {
    const position = index + 1;
    return {
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
      id: stageId(entry, position),
      latitude: entry.latitude,
      longitude: entry.longitude,
      placeId: entry.placeId,
      placeKey: entry.placeKey,
      position,
    };
  });
}

/** Builds mappable stages from ordered Days and their canonical Activity places. */
export function deriveOverviewStages(days: PlannerDay[]): OverviewStage[] {
  const stages: OverviewStage[] = [];
  [...days].sort(compareManualDayOrder).forEach((day) => {
    deriveDayOverviewClusters(day).forEach((cluster, clusterIndex) => {
      if (!cluster.anchor) return;
      const dayLabel = `Day ${day.day_number}`;
      const previous = stages.at(-1);
      if (
        previous?.placeKey === cluster.locality.key &&
        previous.entries.at(-1)?.dayNumber === day.day_number - 1
      ) {
        if (!previous.entries.some(({ dayNumber }) => dayNumber === day.day_number))
          previous.entries.push({
            dayLabel,
            dayNumber: day.day_number,
            itemId: cluster.anchor.itemId,
            title: cluster.locality.label,
          });
        const first = previous.entries[0].dayNumber;
        previous.dayRangeLabel =
          first === day.day_number ? `Day ${first}` : `Days ${first}–${day.day_number}`;
        return;
      }
      stages.push({
        dayRangeLabel: dayLabel,
        entries: [
          {
            dayLabel,
            dayNumber: day.day_number,
            itemId: cluster.anchor.itemId,
            title: cluster.locality.label,
          },
        ],
        firstDayLabel: dayLabel,
        id: `overview-cluster:${day.id}:${clusterIndex}:${cluster.anchor.itemId}`,
        latitude: cluster.anchor.latitude,
        longitude: cluster.anchor.longitude,
        placeId: cluster.anchor.placeId,
        placeKey: cluster.locality.key,
        position: stages.length + 1,
      });
    });
  });
  return stages;
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

export function isOverviewRouteLeg(from: OverviewStage, to: OverviewStage) {
  const crossesDay = from.entries[0].dayNumber !== to.entries[0].dayNumber;
  return !crossesDay || from.placeKey !== to.placeKey;
}

export function buildOverviewRouteLines(
  stages: OverviewStage[],
  calculatedLegs: CalculatedRouteLeg[],
): PlannerMapLine[] {
  const calculatedByPosition = new Map(calculatedLegs.map((leg) => [leg.position, leg]));
  return stages.slice(1).flatMap((stage, index) => {
    const position = index + 1;
    const previous = stages[index];
    if (!isOverviewRouteLeg(previous, stage)) return [];
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
          routeLayer: "city" as const,
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
          routeLayer: "city" as const,
        },
      ];
    }
  });
}
