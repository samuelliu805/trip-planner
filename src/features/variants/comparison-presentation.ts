import { format, parseISO } from "date-fns";

import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import { orderedCityOccurrencesFromDays, type OrderedCitySourceDay } from "../routes/city-order.ts";
import {
  deriveOverviewStagesFromOccurrences,
  isOverviewRouteLeg,
  type OverviewStage,
} from "../routes/overview.ts";

import type {
  VariantComparisonPresentation,
  VariantComparisonProjection,
} from "./comparison-types";

function comparisonSourceDays(projection: VariantComparisonProjection): OrderedCitySourceDay[] {
  return projection.days.map((day) => ({
    cities: day.cities.map((city) => ({
      address: city.formattedAddress,
      itemId: city.itemId,
      latitude: city.latitude,
      longitude: city.longitude,
      placeId: city.placeId,
      placeKey: city.placeKey,
      sortOrder: city.sortOrder,
      title: city.title,
    })),
    dayId: day.id,
    dayLabel: day.date ? format(parseISO(day.date), "MMM d") : `Day ${day.dayNumber}`,
    dayNumber: day.dayNumber,
  }));
}

export function deriveComparisonStages(projection: VariantComparisonProjection): OverviewStage[] {
  return deriveOverviewStagesFromOccurrences(
    orderedCityOccurrencesFromDays(comparisonSourceDays(projection)),
    (entry, position) => `comparison:${projection.variantId}:stage:${position}:${entry.itemId}`,
  );
}

export function formatCitySequence(stages: OverviewStage[]) {
  return stages.length
    ? stages.map(({ entries }) => entries[0].title).join(" → ")
    : "No City stages";
}

export function deriveVariantComparisonPresentation(
  projection: VariantComparisonProjection,
  activeVariantId: string,
): VariantComparisonPresentation {
  const active = projection.variantId === activeVariantId;
  const stages = deriveComparisonStages(projection);
  const markers: PlannerMapMarker[] = stages.map((stage) => {
    const entry = stage.entries[0];
    return {
      accessibleLabel: `${projection.name}, ${entry.title}, City stage ${stage.position}, ${entry.dayLabel}, read-only route comparison`,
      address: stage.address,
      appearance: active ? "comparison-active" : "comparison-inactive",
      entries: [{ ...entry, kind: "city" }],
      id: stage.id,
      itemIds: [entry.itemId],
      label: String(stage.position),
      latitude: stage.latitude,
      longitude: stage.longitude,
      readOnly: true,
      selectable: false,
      stageNumber: stage.position,
      summary: `${projection.name} · City stage ${stage.position} · ${entry.dayLabel}`,
      variantColor: projection.color,
      variantId: projection.variantId,
      variantName: projection.name,
      zIndex: active ? 35 : 15,
    };
  });
  const lines: PlannerMapLine[] = stages.slice(1).flatMap((stage, index) => {
    const previous = stages[index];
    const position = index + 1;
    if (!isOverviewRouteLeg(previous, stage)) return [];
    return [
      {
        color: projection.color,
        dashed: true,
        geodesic: false,
        id: `comparison:${projection.variantId}:leg:${position}`,
        opacity: active ? 0.9 : 0.52,
        path: [
          { lat: previous.latitude, lng: previous.longitude },
          { lat: stage.latitude, lng: stage.longitude },
        ],
        position,
        readOnly: true,
        strokeWeight: active ? 5 : 3,
        variantId: projection.variantId,
        zIndex: active ? 3 : 1,
      },
    ];
  });
  return {
    citySequence: formatCitySequence(stages),
    color: projection.color,
    isActive: active,
    isPrimary: projection.isPrimary,
    lines,
    markers,
    name: projection.name,
    stages,
    variantId: projection.variantId,
  };
}

export function visibleComparisonPresentations(
  presentations: VariantComparisonPresentation[],
  visibleVariantIds: ReadonlySet<string>,
  activeVariantId: string,
) {
  return presentations.filter(
    ({ variantId }) => variantId === activeVariantId || visibleVariantIds.has(variantId),
  );
}
