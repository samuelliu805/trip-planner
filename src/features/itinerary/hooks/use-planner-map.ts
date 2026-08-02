"use client";

import { useMemo, useState } from "react";

import { categories } from "@/features/itinerary/components/planner-config";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-shell";
import type { GridCoordinate } from "@/features/itinerary/grid-interactions";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-canvas";
import { buildOverviewRouteLines, deriveOverviewStages } from "@/features/routes/overview";
import { buildDayRouteLines, buildDayRouteMarkers } from "@/features/routes/day-route-map";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import { useOverviewRoute } from "@/features/routes/use-overview-route";
import { deriveOverviewDefaultModes } from "@/features/routes/overview-transport";
import {
  buildDayCityMarkers,
  buildDayCityRouteLines,
  type DayMapLayer,
} from "@/features/routes/day-city-map";

export function usePlannerMap(
  workspace: PlannerWorkspace,
  selectionEnd: GridCoordinate,
  setSelectionAnchor: (coordinate: GridCoordinate) => void,
  setSelectionEnd: (coordinate: GridCoordinate) => void,
  dayRoute: DayRouteUi,
) {
  const [mapMode, setMapMode] = useState<PlannerMapMode>("overview");
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [dayLayerState, setDayLayerState] = useState<{
    dayId: string;
    layer: DayMapLayer;
  } | null>(null);
  const selectedMapItem = useMemo(() => {
    if (!selectedItemId) return undefined;
    const day = workspace.days[selectionEnd.row];
    const category = categories[selectionEnd.column];
    if (!day || !category) return undefined;
    const cellItems = day.items.filter((item) => category.types.includes(item.type));
    return cellItems.find(({ id }) => id === selectedItemId);
  }, [selectedItemId, selectionEnd.column, selectionEnd.row, workspace.days]);
  const overviewStages = useMemo(() => deriveOverviewStages(workspace.days), [workspace.days]);
  const overviewDefaultModes = useMemo(
    () => deriveOverviewDefaultModes(workspace.days, overviewStages),
    [overviewStages, workspace.days],
  );
  const overviewRoute = useOverviewRoute(
    overviewStages,
    overviewDefaultModes,
    workspace.variant.trip_id,
  );
  const overviewMarkers = useMemo<PlannerMapMarker[]>(
    () =>
      overviewStages.map((stage) => ({
        address: stage.address,
        appearance: "overview",
        entries: stage.entries.map((entry) => ({ ...entry, kind: "city" as const })),
        id: stage.id,
        itemIds: stage.entries.map(({ itemId }) => itemId),
        label: stage.firstDayLabel,
        latitude: stage.latitude,
        longitude: stage.longitude,
        summary: `${stage.firstDayLabel} · City ${stage.position}`,
      })),
    [overviewStages],
  );
  const overviewLines = useMemo<PlannerMapLine[]>(
    () => buildOverviewRouteLines(overviewStages, overviewRoute.calculatedLegs),
    [overviewRoute.calculatedLegs, overviewStages],
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
  const dayCityMarkers = useMemo(
    () => buildDayCityMarkers(dayRoute.activeDay, overviewStages),
    [dayRoute.activeDay, overviewStages],
  );
  const dayCityLines = useMemo(
    () => buildDayCityRouteLines(dayRoute.activeDay, overviewStages, overviewRoute.calculatedLegs),
    [dayRoute.activeDay, overviewRoute.calculatedLegs, overviewStages],
  );
  const dayMapLayer =
    dayLayerState && dayLayerState.dayId === dayRoute.activeDay?.id ? dayLayerState.layer : "all";
  const showDayCities = dayCityMarkers.length > 1 && dayMapLayer !== "places";
  const showDayPlaces = dayMapLayer !== "cities";
  const mapMarkers =
    mapMode === "overview"
      ? overviewMarkers
      : [...(showDayCities ? dayCityMarkers : []), ...(showDayPlaces ? dayRouteMarkers : [])];
  const mapLines =
    mapMode === "overview"
      ? overviewLines
      : [...(showDayCities ? dayCityLines : []), ...(showDayPlaces ? dayRouteLines : [])];
  const overviewViewportKey = overviewStages
    .map(({ id, latitude, longitude }) => `${id}:${latitude}:${longitude}`)
    .join("|");
  const dayRouteViewportKey = mapMarkers
    .map(({ id, latitude, longitude }) => `${id}:${latitude}:${longitude}`)
    .join("|");

  function selectMarker(itemId?: string) {
    if (!itemId) {
      setSelectedItemId(undefined);
      return;
    }
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

  function changeMapMode(mode: PlannerMapMode) {
    if (mode === mapMode) return;
    setMapMode(mode);
    setSelectedItemId(undefined);
    if (mode !== "overview") return;
    const row = selectionEnd.row >= 0 ? selectionEnd.row : 0;
    const day = workspace.days[row];
    const cityColumn = categories.findIndex(({ id }) => id === "city");
    if (!day || cityColumn < 0) return;
    const coordinate = { column: cityColumn, row };
    setSelectionAnchor(coordinate);
    setSelectionEnd(coordinate);
    const firstCity = day.items
      .filter(({ type }) => type === "location")
      .sort((a, b) => a.sort_order - b.sort_order)[0];
    setSelectedItemId(firstCity?.id);
  }

  return {
    mapEmptyState:
      mapMode === "overview"
        ? {
            message: "Link a saved map place to a City item to build the trip overview.",
            title: "No City stages yet",
          }
        : !mapMarkers.length
          ? {
              message:
                dayMapLayer === "cities"
                  ? "Add at least two different, place-linked City items to this day."
                  : "Add a saved place to an Activity, Meal, or Hotel on this day.",
              title: dayMapLayer === "cities" ? "No City transfers" : "No eligible places",
            }
          : undefined,
    dayCityLayerAvailable: dayCityMarkers.length > 1,
    dayMapLayer,
    mapLines,
    mapMode,
    mapMarkers,
    mapViewportKey:
      mapMode === "overview"
        ? `overview:${overviewViewportKey}`
        : `day-route:${dayRoute.activeDay?.id ?? "none"}:${dayMapLayer}:${dayRouteViewportKey}:${dayRoute.fitKey ?? "default"}`,
    overviewRoute,
    selectedMapItem,
    selectMarker,
    selectedItemId,
    setMapModeFromSelection: setMapMode,
    setDayMapLayer: (layer: DayMapLayer) => {
      if (dayRoute.activeDay) setDayLayerState({ dayId: dayRoute.activeDay.id, layer });
      setSelectedItemId(undefined);
    },
    setSelectedItemId,
    setMapMode: changeMapMode,
  };
}
