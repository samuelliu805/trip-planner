"use client";

import { useMemo, useState } from "react";

import { categories } from "@/features/itinerary/components/planner-config";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-shell";
import type { GridCoordinate } from "@/features/itinerary/grid-interactions";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-canvas";
import { deriveOverviewStages } from "@/features/routes/overview";
import { buildDayRouteLines, buildDayRouteMarkers } from "@/features/routes/day-route-map";
import type { DayRouteUi } from "@/features/routes/use-day-route";

export function usePlannerMap(
  workspace: PlannerWorkspace,
  selectionEnd: GridCoordinate,
  setSelectionAnchor: (coordinate: GridCoordinate) => void,
  setSelectionEnd: (coordinate: GridCoordinate) => void,
  dayRoute: DayRouteUi,
) {
  const [mapMode, setMapMode] = useState<PlannerMapMode>("overview");
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const selectedMapItem = useMemo(() => {
    const day = workspace.days[selectionEnd.row];
    const category = categories[selectionEnd.column];
    if (!day || !category) return undefined;
    const cellItems = day.items.filter((item) => category.types.includes(item.type));
    return cellItems.find(({ id }) => id === selectedItemId) ?? cellItems[0];
  }, [selectedItemId, selectionEnd.column, selectionEnd.row, workspace.days]);
  const overviewStages = useMemo(() => deriveOverviewStages(workspace.days), [workspace.days]);
  const overviewMarkers = useMemo<PlannerMapMarker[]>(
    () =>
      overviewStages.map((stage) => ({
        address: stage.address,
        appearance: "overview",
        entries: stage.entries.map((entry) => ({ ...entry, kind: "city" as const })),
        id: stage.id,
        itemIds: stage.entries.map(({ itemId }) => itemId),
        label: String(stage.position),
        latitude: stage.latitude,
        longitude: stage.longitude,
        summary: `${stage.dayRangeLabel} · ${stage.entries.length} ${stage.entries.length === 1 ? "City item" : "City items"}`,
      })),
    [overviewStages],
  );
  const overviewLines = useMemo<PlannerMapLine[]>(
    () =>
      overviewStages.slice(1).map((stage, index) => ({
        color: "#166534",
        id: `overview-line:${overviewStages[index].id}:${stage.id}`,
        path: [
          { lat: overviewStages[index].latitude, lng: overviewStages[index].longitude },
          { lat: stage.latitude, lng: stage.longitude },
        ],
      })),
    [overviewStages],
  );
  const routeStopIds = useMemo(
    () =>
      dayRoute.editing
        ? (dayRoute.draft?.itemIds ?? [])
        : (dayRoute.plan?.stops
            .slice()
            .sort((a, b) => a.position - b.position)
            .map(({ item_id }) => item_id) ?? []),
    [dayRoute.draft?.itemIds, dayRoute.editing, dayRoute.plan?.stops],
  );
  const dayRouteMarkers = useMemo(
    () => buildDayRouteMarkers(dayRoute.activeDay, routeStopIds),
    [dayRoute.activeDay, routeStopIds],
  );
  const dayRouteLines = useMemo(
    () => buildDayRouteLines(dayRoute.plan?.calculation ?? null),
    [dayRoute.plan?.calculation],
  );
  const mapMarkers = mapMode === "overview" ? overviewMarkers : dayRouteMarkers;
  const mapLines = mapMode === "overview" ? overviewLines : dayRouteLines;
  const overviewViewportKey = overviewStages
    .map(({ id, latitude, longitude }) => `${id}:${latitude}:${longitude}`)
    .join("|");

  function selectMarker(itemId: string) {
    workspace.days.some((day, row) => {
      const item = day.items.find(({ id }) => id === itemId);
      if (!item) return false;
      const coordinate = {
        row,
        column: categories.findIndex(({ types }) => types.includes(item.type)),
      };
      setSelectionAnchor(coordinate);
      setSelectionEnd(coordinate);
      setSelectedItemId(item.id);
      return true;
    });
  }

  return {
    mapEmptyState:
      mapMode === "overview"
        ? {
            message: "Link a saved map place to a City item to build the trip overview.",
            title: "No City stages yet",
          }
        : !dayRouteMarkers.length
          ? {
              message: "Add a saved place to an Activity, Meal, or Hotel on this day.",
              title: "No eligible places",
            }
          : undefined,
    mapLines,
    mapMode,
    mapMarkers,
    mapViewportKey: mapMode === "overview" ? `overview:${overviewViewportKey}` : dayRoute.fitKey,
    selectedMapItem,
    selectMarker,
    selectedItemId,
    setSelectedItemId,
    setMapMode,
  };
}
