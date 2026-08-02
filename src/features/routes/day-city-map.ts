import type { PlannerDay } from "@/features/itinerary/types";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-canvas";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";

import { buildOverviewRouteLines, type OverviewStage } from "./overview.ts";

export const dayMapLayers = ["all", "cities", "places"] as const;
export type DayMapLayer = (typeof dayMapLayers)[number];

export function dayCityStages(day: PlannerDay | undefined, stages: OverviewStage[]) {
  if (!day) return [];
  return stages.filter(({ entries }) => entries[0]?.dayNumber === day.day_number);
}

export function buildDayCityMarkers(
  day: PlannerDay | undefined,
  stages: OverviewStage[],
): PlannerMapMarker[] {
  const matching = dayCityStages(day, stages);
  if (matching.length < 2) return [];
  return matching.map((stage) => ({
    address: stage.address,
    appearance: "day-city",
    entries: stage.entries.map((entry) => ({ ...entry, kind: "city" as const })),
    id: `day-city:${day!.id}:${stage.id}`,
    itemIds: stage.entries.map(({ itemId }) => itemId),
    label: stage.firstDayLabel,
    latitude: stage.latitude,
    longitude: stage.longitude,
    summary: `${stage.firstDayLabel} · City transfer`,
  }));
}

export function buildDayCityRouteLines(
  day: PlannerDay | undefined,
  stages: OverviewStage[],
  calculatedLegs: CalculatedRouteLeg[],
): PlannerMapLine[] {
  const matching = dayCityStages(day, stages);
  if (matching.length < 2) return [];
  const matchingIds = new Set(matching.map(({ id }) => id));
  const includedPositions = new Set(
    stages
      .slice(1)
      .flatMap((stage, index) =>
        matchingIds.has(stage.id) && matchingIds.has(stages[index].id) ? [index + 1] : [],
      ),
  );
  return buildOverviewRouteLines(stages, calculatedLegs)
    .filter(({ position }) => position !== undefined && includedPositions.has(position))
    .map((line) => ({
      ...line,
      color: "#2563eb",
      id: `day-city:${day!.id}:${line.id}`,
    }));
}
