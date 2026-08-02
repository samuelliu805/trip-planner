"use client";

import { useMemo, useState } from "react";

import { categories } from "@/features/itinerary/components/planner-config";
import {
  allMarkerKinds,
  buildPlannerMapMarkers,
  type PlannerMapMode,
} from "@/features/itinerary/components/planner-map-shell";
import type { GridCoordinate } from "@/features/itinerary/grid-interactions";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import type {
  MarkerKind,
  PlannerMapLine,
  PlannerMapMarker,
} from "@/features/maps/planner-map-canvas";
import { deriveOverviewStages } from "@/features/routes/overview";

export function usePlannerMap(
  workspace: PlannerWorkspace,
  selectionEnd: GridCoordinate,
  setSelectionAnchor: (coordinate: GridCoordinate) => void,
  setSelectionEnd: (coordinate: GridCoordinate) => void,
) {
  const [mapMode, setMapMode] = useState<PlannerMapMode>("overview");
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [visibleMarkerKinds, setVisibleMarkerKinds] = useState<Set<MarkerKind>>(() => new Set());
  const selectedMapItem = useMemo(() => {
    const day = workspace.days[selectionEnd.row];
    const category = categories[selectionEnd.column];
    if (!day || !category) return undefined;
    const cellItems = day.items.filter((item) => category.types.includes(item.type));
    return cellItems.find(({ id }) => id === selectedItemId) ?? cellItems[0];
  }, [selectedItemId, selectionEnd.column, selectionEnd.row, workspace.days]);
  const allMapMarkers = useMemo(() => buildPlannerMapMarkers(workspace.days), [workspace.days]);
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
  const mapMarkers = mapMode === "overview" ? overviewMarkers : allMapMarkers;
  const mapLines = mapMode === "overview" ? overviewLines : [];

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

  function toggleMarkerKind(kind: MarkerKind) {
    setVisibleMarkerKinds((current) => {
      if (!current.size) return new Set([kind]);
      const next = new Set(current);
      if (next.has(kind)) {
        if (next.size === 1) return new Set();
        next.delete(kind);
      } else {
        next.add(kind);
        if (next.size === allMarkerKinds.length) return new Set();
      }
      return next;
    });
  }

  return {
    mapEmptyState:
      mapMode === "overview"
        ? {
            message: "Link a saved map place to a City item to build the trip overview.",
            title: "No City stages yet",
          }
        : undefined,
    mapLines,
    mapMode,
    mapMarkers,
    selectedMapItem,
    selectMarker,
    selectedItemId,
    setSelectedItemId,
    setMapMode,
    toggleMarkerKind,
    visibleMarkerKinds,
  };
}
