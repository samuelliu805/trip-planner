"use client";

import { useIsMutating } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  categories,
  isCategoryAtCapacity,
  plannerSelectionSize,
  type EditorState,
} from "../components/planner-config";
import type { PlannerWorkspaceProps } from "../components/planner-workspace-types";
import {
  initialPlannerSelection,
  selectionBounds,
  type GridCoordinate,
} from "../grid-interactions";
import { usePlannerWorkspace } from "../planner-query";
import { projectWorkspaceDraft } from "../query-cache";
import { normalizeTransportMode, type ItineraryItem, type PlannerWorkspace } from "../types";
import { useDayRoute } from "../../routes/use-day-route";
import { useRouteVariants } from "../../variants/queries";
import { usePlannerClipboard } from "./use-planner-clipboard";
import { usePlannerInteractions } from "./use-planner-interactions";
import { usePlannerMap } from "./use-planner-map";
import { usePlannerMutations } from "./use-planner-mutations";

export function usePlannerWorkspaceController({
  initialVariants,
  initialWorkspace,
  trip,
}: Pick<PlannerWorkspaceProps, "initialVariants" | "initialWorkspace" | "trip">) {
  const { data: workspace = initialWorkspace, error: workspaceError } = usePlannerWorkspace(
    trip.id,
    initialWorkspace.variant.id,
    initialWorkspace,
  );
  const { data: variants = initialVariants } = useRouteVariants(trip.id, initialVariants);
  const initialSelection = initialPlannerSelection(
    initialWorkspace.days.length,
    categories.findIndex(({ id }) => id === "city"),
  );
  const [split, setSplit] = useState(58);
  const [selectionAnchor, setSelectionAnchor] = useState<GridCoordinate>(() => initialSelection);
  const [selectionEnd, commitSelectionEnd] = useState<GridCoordinate>(() => initialSelection);
  const [selectedDayRow, setSelectedDayRow] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [draftItem, setDraftItem] = useState<ItineraryItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [arrangeActivitiesRequest, setArrangeActivitiesRequest] = useState<{
    dayId: string;
    initialMovingItemId?: string;
  }>();
  const [mapExpanded, setMapExpanded] = useState(false);
  const [interactionError, setInteractionError] = useState<string>();
  const [clearTargetItems, setClearTargetItems] = useState<
    PlannerWorkspace["days"][number]["items"]
  >([]);
  const [isFillDragging, setIsFillDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectionEndRef = useRef(selectionEnd);
  const fillDragging = useRef(false);
  const fillFrame = useRef<number | null>(null);
  const fillSourceRight = useRef(0);
  const rangeJustSelected = useRef(false);

  useEffect(() => {
    selectionEndRef.current = selectionEnd;
  }, [selectionEnd]);

  const projectedWorkspace = useMemo(
    () => projectWorkspaceDraft(workspace, draftItem),
    [draftItem, workspace],
  );
  const mutating = useIsMutating() > 0;
  const selectedCount = plannerSelectionSize(selectionAnchor, selectionEnd);
  const selectedDay = selectedDayRow === null ? null : projectedWorkspace.days[selectedDayRow];
  const activeDay = projectedWorkspace.days[selectionEnd.row];
  const activeCategory = categories[selectionEnd.column];
  const activeCellAtCapacity = isCategoryAtCapacity(activeDay, activeCategory);
  const unavailableTransportModes = editor
    ? (projectedWorkspace.days
        .find((day) => day.id === editor.dayId)
        ?.items.filter((item) => item.type === "transport" && item.id !== editor.item?.id)
        .map((item) => normalizeTransportMode((item.details as Record<string, string>).mode)) ?? [])
    : [];
  const visibleSelectionBounds = selectionBounds(selectionAnchor, selectionEnd);
  const selectedItems = useMemo(
    () =>
      projectedWorkspace.days
        .slice(visibleSelectionBounds.top, visibleSelectionBounds.bottom + 1)
        .flatMap((day) =>
          categories
            .slice(visibleSelectionBounds.left, visibleSelectionBounds.right + 1)
            .flatMap((category) => day.items.filter((item) => category.types.includes(item.type))),
        ),
    [
      projectedWorkspace.days,
      visibleSelectionBounds.bottom,
      visibleSelectionBounds.left,
      visibleSelectionBounds.right,
      visibleSelectionBounds.top,
    ],
  );
  const itemCount = projectedWorkspace.days.reduce((count, day) => count + day.items.length, 0);
  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(parseISO(trip.start_date), "MMM d")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}`
      : `${trip.day_count} planning ${trip.day_count === 1 ? "day" : "days"} · Dates not set`;
  const gridTemplate = `minmax(520px, ${split}fr) 4px minmax(360px, ${100 - split}fr)`;
  const routeDay = activeDay ?? selectedDay ?? projectedWorkspace.days[0];
  const dayRoute = useDayRoute(projectedWorkspace, routeDay, trip.id);
  const arrangeActivitiesDay = projectedWorkspace.days.find(
    ({ id }) => id === arrangeActivitiesRequest?.dayId,
  );

  const mutations = usePlannerMutations(trip.id, workspace.variant.id, setInteractionError);
  const {
    clearItems,
    clearPending,
    dayMutationPending,
    deleteItem,
    insertDay,
    itemOrderPending,
    reorderItems,
    removeDay,
  } = mutations;

  const map = usePlannerMap(
    projectedWorkspace,
    selectionEnd,
    setSelectionAnchor,
    setSelectionEnd,
    dayRoute,
    variants,
  );

  function requestClearSelection() {
    if (!selectedItems.length) return;
    setInteractionError(undefined);
    setClearTargetItems(selectedItems);
  }

  async function confirmClearSelection() {
    const cleared = await clearItems(clearTargetItems);
    if (!cleared) return;
    clearTargetItems.forEach(({ id }) => dayRoute.removeItem(id));
    if (editor?.item && clearTargetItems.some(({ id }) => id === editor.item?.id)) setEditor(null);
    map.setSelectedItemId(undefined);
    setClearTargetItems([]);
  }

  function setSelectionEnd(coordinate: GridCoordinate) {
    selectionEndRef.current = coordinate;
    if (!fillDragging.current) {
      commitSelectionEnd(coordinate);
      return;
    }
    if (fillFrame.current !== null) return;
    fillFrame.current = requestAnimationFrame(() => {
      fillFrame.current = null;
      commitSelectionEnd(selectionEndRef.current);
    });
  }

  function editMapItem(itemId: string) {
    for (const day of projectedWorkspace.days) {
      const item = day.items.find(({ id }) => id === itemId);
      if (item) {
        setEditor({ dayId: day.id, item, type: item.type });
        return;
      }
    }
  }

  const clipboard = usePlannerClipboard({
    selectionAnchor,
    selectionEnd,
    setInteractionError,
    tripId: trip.id,
    workspace,
  });

  function changeMapModeAndSelection(mode: Parameters<typeof map.setMapMode>[0]) {
    map.setMapMode(mode);
    if (mode !== "overview") return;
    setSelectedDayRow(null);
    map.setSelectedItemId(undefined);
    setSelectionAnchor({ column: -1, row: -1 });
    setSelectionEnd({ column: -1, row: -1 });
  }

  const interactions = usePlannerInteractions({
    containerRef,
    fillDown: clipboard.fillDown,
    fillDragging,
    fillFrame,
    fillSourceRight,
    rangeJustSelected,
    selectionAnchor,
    selectionEnd,
    selectionEndRef,
    setEditor,
    setInteractionError,
    setIsFillDragging,
    setSelectedDayRow,
    setSelectedItemId: map.setSelectedItemId,
    setMapMode: map.setMapModeFromSelection,
    setSelectionAnchor,
    setSelectionEnd,
    setSplit,
    workspace,
  });

  return {
    activeCategory,
    activeCellAtCapacity,
    activeDay,
    arrangeActivitiesDay,
    arrangeActivitiesRequest,
    changeMapModeAndSelection,
    clearPending,
    clearTargetItems,
    clipboard,
    confirmClearSelection,
    containerRef,
    dateRange,
    dayMutationPending,
    dayRoute,
    deleteItem,
    draftItem,
    editMapItem,
    editor,
    fillLabel: categories[selectionAnchor.column]?.label ?? "this column",
    fillDragging,
    fillSourceRight,
    gridTemplate,
    interactionError,
    interactions,
    isFillDragging,
    itemCount,
    itemOrderPending,
    map,
    mapExpanded,
    mutating,
    projectedWorkspace,
    removeDay,
    reorderItems,
    requestClearSelection,
    selectedCount,
    selectedDay,
    selectedDayRow,
    selectedItems,
    selectionAnchor,
    selectionEnd,
    selectionEndRef,
    setArrangeActivitiesRequest,
    setClearTargetItems,
    setDraftItem,
    setEditor,
    setInteractionError,
    setMapExpanded,
    setSelectionEnd,
    setSettingsOpen,
    setSplit,
    settingsOpen,
    split,
    unavailableTransportModes,
    variants,
    visibleSelectionBounds,
    workspace,
    workspaceError,
    insertDay,
  };
}

export type PlannerWorkspaceController = ReturnType<typeof usePlannerWorkspaceController>;
