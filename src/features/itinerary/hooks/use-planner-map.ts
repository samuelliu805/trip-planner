"use client";

import { useMemo, useState } from "react";

import { categories } from "@/features/itinerary/components/planner-config";
import {
  allMarkerKinds,
  buildPlannerMapMarkers,
} from "@/features/itinerary/components/planner-map-shell";
import type { GridCoordinate } from "@/features/itinerary/grid-interactions";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import type { MarkerKind } from "@/features/maps/planner-map-canvas";

export function usePlannerMap(
  workspace: PlannerWorkspace,
  selectionEnd: GridCoordinate,
  setSelectionAnchor: (coordinate: GridCoordinate) => void,
  setSelectionEnd: (coordinate: GridCoordinate) => void,
) {
  const [selectedItemId, setSelectedItemId] = useState<string>();
  const [visibleMarkerKinds, setVisibleMarkerKinds] = useState<Set<MarkerKind>>(() => new Set());
  const selectedMapItem = useMemo(() => {
    const day = workspace.days[selectionEnd.row];
    const category = categories[selectionEnd.column];
    if (!day || !category) return undefined;
    const cellItems = day.items.filter((item) => category.types.includes(item.type));
    return cellItems.find(({ id }) => id === selectedItemId) ?? cellItems[0];
  }, [selectedItemId, selectionEnd.column, selectionEnd.row, workspace.days]);
  const mapMarkers = useMemo(() => buildPlannerMapMarkers(workspace.days), [workspace.days]);

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
    mapMarkers,
    selectedMapItem,
    selectMarker,
    selectedItemId,
    setSelectedItemId,
    toggleMarkerKind,
    visibleMarkerKinds,
  };
}
