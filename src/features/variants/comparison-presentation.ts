import { format, parseISO } from "date-fns";

import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import { decodeEncodedPolyline } from "../../lib/providers/routes/geo.ts";
import { orderedCityOccurrencesFromDays, type OrderedCitySourceDay } from "../routes/city-order.ts";
import {
  deriveOverviewStagesFromOccurrences,
  isOverviewRouteLeg,
  type OverviewStage,
} from "../routes/overview.ts";

import type {
  VariantComparisonDayRoute,
  VariantComparisonPresentation,
  VariantComparisonProjection,
  VariantComparisonRouteStop,
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
  const raw = deriveOverviewStagesFromOccurrences(
    orderedCityOccurrencesFromDays(comparisonSourceDays(projection)),
    (entry, position) => `comparison:${projection.variantId}:stage:${position}:${entry.itemId}`,
  );
  return raw.reduce<OverviewStage[]>((stages, stage) => {
    const previous = stages.at(-1);
    if (!previous || previous.placeKey !== stage.placeKey) {
      stages.push({ ...stage, position: stages.length + 1 });
      return stages;
    }
    previous.entries.push(...stage.entries);
    previous.dayRangeLabel = `${previous.firstDayLabel}–${stage.entries.at(-1)?.dayLabel}`;
    return stages;
  }, []);
}

export function formatCitySequence(stages: OverviewStage[]) {
  return stages.length
    ? stages
        .filter((stage, index) => index === 0 || stages[index - 1].placeKey !== stage.placeKey)
        .map(({ entries }) => entries[0].title)
        .join(" → ")
    : "No city/town stages";
}

export function deriveVariantComparisonPresentation(
  projection: VariantComparisonProjection,
  activeVariantId: string,
  dayNumber?: number,
): VariantComparisonPresentation {
  const active = projection.variantId === activeVariantId;
  if (dayNumber !== undefined) {
    return deriveDayRouteComparisonPresentation(projection, active, dayNumber);
  }
  const stages = deriveComparisonStages(projection);
  const markers: PlannerMapMarker[] = stages.map((stage) => {
    const entry = stage.entries[0];
    return {
      accessibleLabel: `${projection.name}, ${entry.title}, locality stage ${stage.position}, ${entry.dayLabel}, read-only route comparison`,
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
      summary: `${projection.name} · locality stage ${stage.position} · ${entry.dayLabel}`,
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
    knownCost: projection.knownCost,
    lines,
    markers,
    name: projection.name,
    stages,
    variantId: projection.variantId,
  };
}

function routeStopKind(type: VariantComparisonRouteStop["type"]): "activity" | "hotel" | "meal" {
  return type === "hotel" ? "hotel" : type === "meal" ? "meal" : "activity";
}

function dayRouteComparisonMarkers(
  projection: VariantComparisonProjection,
  active: boolean,
  dayNumber: number,
  route: VariantComparisonDayRoute,
) {
  const grouped = new Map<string, PlannerMapMarker>();
  route.stops.forEach((stop, index) => {
    const position = index + 1;
    const entry = {
      dayLabel: `Day ${dayNumber}`,
      dayNumber,
      itemId: stop.itemId,
      kind: routeStopKind(stop.type),
      title: stop.title,
    };
    const existing = grouped.get(stop.placeId);
    if (existing) {
      existing.entries.push(entry);
      existing.itemIds.push(stop.itemId);
      existing.label = `${existing.label} · ${position}`;
      return;
    }
    grouped.set(stop.placeId, {
      accessibleLabel: `${projection.name}, Day ${dayNumber}, route stop ${position}, ${stop.title}, read-only comparison`,
      address: stop.formattedAddress,
      appearance: active ? "comparison-active" : "comparison-inactive",
      entries: [entry],
      id: `comparison:${projection.variantId}:day:${dayNumber}:stop:${stop.placeId}`,
      itemIds: [stop.itemId],
      label: String(position),
      latitude: stop.latitude,
      longitude: stop.longitude,
      readOnly: true,
      selectable: false,
      summary: `${projection.name} · Day ${dayNumber} route stop ${position}`,
      variantColor: projection.color,
      variantId: projection.variantId,
      variantName: projection.name,
      zIndex: active ? 35 : 15,
    });
  });
  return [...grouped.values()];
}

function calculatedDayRouteComparisonLines(
  projection: VariantComparisonProjection,
  active: boolean,
  dayNumber: number,
  route: VariantComparisonDayRoute,
) {
  return route.calculatedLegs.flatMap((leg): PlannerMapLine[] => {
    try {
      const path =
        leg.geometry.source === "google"
          ? decodeEncodedPolyline(leg.geometry.encodedPolyline).map(({ latitude, longitude }) => ({
              lat: latitude,
              lng: longitude,
            }))
          : [
              { lat: leg.geometry.origin.latitude, lng: leg.geometry.origin.longitude },
              {
                lat: leg.geometry.destination.latitude,
                lng: leg.geometry.destination.longitude,
              },
            ];
      if (path.length < 2) return [];
      return [
        {
          color: projection.color,
          dashed: leg.geometry.source === "straight",
          id: `comparison:${projection.variantId}:day:${dayNumber}:leg:${leg.position}:${leg.legSignature}`,
          opacity: active ? 0.9 : 0.52,
          path,
          position: leg.position,
          readOnly: true,
          routeLayer: "places",
          strokeWeight: active ? 5 : 3,
          variantId: projection.variantId,
          zIndex: active ? 3 : 1,
        },
      ];
    } catch {
      return [];
    }
  });
}

function previewDayRouteComparisonLines(
  projection: VariantComparisonProjection,
  active: boolean,
  dayNumber: number,
  route: VariantComparisonDayRoute,
) {
  return route.stops.slice(1).flatMap((stop, index): PlannerMapLine[] => {
    const previous = route.stops[index];
    if (previous.latitude === stop.latitude && previous.longitude === stop.longitude) return [];
    return [
      {
        color: projection.color,
        dashed: true,
        geodesic: false,
        id: `comparison:${projection.variantId}:day:${dayNumber}:preview:${index + 1}`,
        opacity: active ? 0.9 : 0.52,
        path: [
          { lat: previous.latitude, lng: previous.longitude },
          { lat: stop.latitude, lng: stop.longitude },
        ],
        position: index + 1,
        readOnly: true,
        routeLayer: "places",
        strokeWeight: active ? 5 : 3,
        variantId: projection.variantId,
        zIndex: active ? 3 : 1,
      },
    ];
  });
}

function deriveDayRouteComparisonPresentation(
  projection: VariantComparisonProjection,
  active: boolean,
  dayNumber: number,
): VariantComparisonPresentation {
  const day = projection.days.find((candidate) => candidate.dayNumber === dayNumber);
  const route = day?.route ?? { calculatedLegs: [], saved: false, stops: [] };
  const calculatedLines = calculatedDayRouteComparisonLines(projection, active, dayNumber, route);
  return {
    citySequence: route.stops.length
      ? route.stops.map(({ title }) => title).join(" → ")
      : `No Day ${dayNumber} route stops`,
    color: projection.color,
    isActive: active,
    isPrimary: projection.isPrimary,
    knownCost: projection.knownCost,
    lines: calculatedLines.length
      ? calculatedLines
      : previewDayRouteComparisonLines(projection, active, dayNumber, route),
    markers: dayRouteComparisonMarkers(projection, active, dayNumber, route),
    name: projection.name,
    stages: [],
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
