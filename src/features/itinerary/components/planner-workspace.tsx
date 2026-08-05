"use client";

import { useIsMutating } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";

import { PlannerClearCellsDialog } from "@/features/itinerary/components/planner-clear-cells-dialog";
import { PlannerWorkspaceEventBoundary } from "@/features/itinerary/components/planner-workspace-event-boundary";
import { PlannerMatrix } from "@/features/itinerary/components/planner-matrix";
import {
  categories,
  isCategoryAtCapacity,
  plannerSelectionSize,
  type EditorState,
} from "@/features/itinerary/components/planner-config";
import { PlannerSheets } from "@/features/itinerary/components/planner-sheets";
import { PlannerToolbar } from "@/features/itinerary/components/planner-toolbar";
import {
  initialPlannerSelection,
  selectionBounds,
  type GridCoordinate,
} from "@/features/itinerary/grid-interactions";
import { usePlannerWorkspace } from "@/features/itinerary/planner-query";
import { usePlannerClipboard } from "@/features/itinerary/hooks/use-planner-clipboard";
import { usePlannerInteractions } from "@/features/itinerary/hooks/use-planner-interactions";
import { usePlannerMap } from "@/features/itinerary/hooks/use-planner-map";
import { usePlannerMutations } from "@/features/itinerary/hooks/use-planner-mutations";
import {
  normalizeTransportMode,
  type PlannerVariant,
  type PlannerWorkspace as PlannerWorkspaceData,
} from "@/features/itinerary/types";
import type { Tables } from "@/types/database";
import { useDayRoute } from "@/features/routes/use-day-route";
import { RouteVariantControls } from "@/features/variants/components/route-variant-controls";
import { useRouteVariants } from "@/features/variants/queries";

type PlannerWorkspaceProps = {
  deleteError: boolean;
  initialVariants: PlannerVariant[];
  initialWorkspace: PlannerWorkspaceData;
  settings: React.ReactNode;
  trip: Tables<"trips">;
};

export function PlannerWorkspace(props: PlannerWorkspaceProps) {
  return <PlannerWorkspaceVariant key={props.initialWorkspace.variant.id} {...props} />;
}

function PlannerWorkspaceVariant({
  deleteError,
  initialVariants,
  initialWorkspace,
  settings,
  trip,
}: PlannerWorkspaceProps) {
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [interactionError, setInteractionError] = useState<string>();
  const [clearTargetItems, setClearTargetItems] = useState<
    PlannerWorkspaceData["days"][number]["items"]
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
  const mutating = useIsMutating() > 0;
  const selectedCount = plannerSelectionSize(selectionAnchor, selectionEnd);
  const selectedDay = selectedDayRow === null ? null : workspace.days[selectedDayRow];
  const activeDay = workspace.days[selectionEnd.row];
  const activeCategory = categories[selectionEnd.column];
  const activeCellAtCapacity = isCategoryAtCapacity(activeDay, activeCategory);
  const unavailableTransportModes = editor
    ? (workspace.days
        .find((day) => day.id === editor.dayId)
        ?.items.filter((item) => item.type === "transport" && item.id !== editor.item?.id)
        .map((item) => normalizeTransportMode((item.details as Record<string, string>).mode)) ?? [])
    : [];
  const visibleSelectionBounds = selectionBounds(selectionAnchor, selectionEnd);
  const selectedItems = useMemo(
    () =>
      workspace.days
        .slice(visibleSelectionBounds.top, visibleSelectionBounds.bottom + 1)
        .flatMap((day) =>
          categories
            .slice(visibleSelectionBounds.left, visibleSelectionBounds.right + 1)
            .flatMap((category) => day.items.filter((item) => category.types.includes(item.type))),
        ),
    [
      visibleSelectionBounds.bottom,
      visibleSelectionBounds.left,
      visibleSelectionBounds.right,
      visibleSelectionBounds.top,
      workspace.days,
    ],
  );
  const itemCount = workspace.days.reduce((count, day) => count + day.items.length, 0);
  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(parseISO(trip.start_date), "MMM d")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}`
      : `${trip.day_count} planning ${trip.day_count === 1 ? "day" : "days"} · Dates not set`;
  const gridTemplate = `minmax(520px, ${split}fr) 4px minmax(360px, ${100 - split}fr)`;
  const routeDay = activeDay ?? selectedDay ?? workspace.days[0];
  const dayRoute = useDayRoute(workspace, routeDay, trip.id);

  function hasDayRoute(dayId: string) {
    return (
      workspace.routePlans.some(
        (plan) => plan.day_id === dayId && plan.variant_id === workspace.variant.id,
      ) ||
      (dayRoute.editing && dayRoute.activeDay?.id === dayId)
    );
  }

  const {
    clearItems,
    clearPending,
    dayMutationPending,
    deleteItem,
    insertDay,
    moveItem,
    removeDay,
  } = usePlannerMutations(trip.id, workspace.variant.id, setInteractionError);

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
    setSelectedItemId(undefined);
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

  const {
    compactMapEmptyState,
    compactMapLines,
    compactMapMarkers,
    compactMapViewportKey,
    comparison,
    comparisonSheetOpen,
    decisionSummary,
    decisionSummaryPanelOpen,
    decisionSummarySheetOpen,
    dayCityLayerAvailable,
    dayMapLayer,
    enterComparison,
    exitComparison,
    mapEmptyState,
    mapLines,
    mapMode,
    mapMarkers,
    mapViewportKey,
    overviewRoute,
    selectedMapItem,
    selectMarker,
    setComparisonSheetOpen,
    setDecisionSummaryPanelOpen,
    setDecisionSummarySheetOpen,
    setDayMapLayer,
    setMapModeFromSelection,
    setSelectedItemId,
    setMapMode,
  } = usePlannerMap(
    workspace,
    selectionEnd,
    setSelectionAnchor,
    setSelectionEnd,
    dayRoute,
    variants,
  );

  function editMapItem(itemId: string) {
    for (const day of workspace.days) {
      const item = day.items.find(({ id }) => id === itemId);
      if (item) {
        setEditor({ dayId: day.id, item, type: item.type });
        return;
      }
    }
  }

  const {
    clipboardPayload,
    copyDaysOpen,
    copyMutation,
    copyPreviousDay,
    copySelectionToClipboard,
    copyToSelectedDays,
    fillDown,
    internalClipboard,
    pasteAvailableClipboard,
    pastePayload,
    setCopyDaysOpen,
    setInternalClipboard,
    setTargetDays,
    targetDays,
  } = usePlannerClipboard({
    selectionAnchor,
    selectionEnd,
    setInteractionError,
    tripId: trip.id,
    workspace,
  });

  const {
    focusCell,
    handleCellKey,
    openEditorFromDoubleClick,
    selectItem,
    selectDay,
    startFill,
    startRangeSelection,
    startResize,
  } = usePlannerInteractions({
    containerRef,
    fillDown,
    fillDragging,
    fillFrame,
    fillSourceRight,
    hasDayRoute,
    rangeJustSelected,
    selectionAnchor,
    selectionEnd,
    selectionEndRef,
    setEditor,
    setInteractionError,
    setIsFillDragging,
    setSelectedDayRow,
    setSelectedItemId,
    setMapMode: setMapModeFromSelection,
    setSelectionAnchor,
    setSelectionEnd,
    setSplit,
    workspace,
  });

  return (
    <PlannerWorkspaceEventBoundary
      clipboardPayload={clipboardPayload}
      internalClipboard={internalClipboard}
      onClearRequest={requestClearSelection}
      pastePayload={pastePayload}
      selectedItemCount={selectedItems.length}
      setInteractionError={setInteractionError}
      setInternalClipboard={setInternalClipboard}
    >
      <PlannerToolbar
        activeCategory={activeCategory}
        activeCellAtCapacity={activeCellAtCapacity}
        activeDay={activeDay}
        copyPreviousDay={copyPreviousDay}
        copySelectionToClipboard={copySelectionToClipboard}
        clearItemCount={selectedItems.length}
        clearPending={clearPending}
        dateRange={dateRange}
        dayMutationPending={dayMutationPending}
        deleteError={deleteError}
        fillLabel={categories[selectionAnchor.column]?.label ?? "this column"}
        fillThroughDay={workspace.days[selectionEnd.row]?.day_number}
        insertDay={insertDay}
        interactionError={interactionError}
        isEmpty={itemCount === 0}
        isFillDragging={isFillDragging}
        mutating={mutating}
        pasteAvailableClipboard={pasteAvailableClipboard}
        requestClearSelection={requestClearSelection}
        removeDay={removeDay}
        selectedCount={selectedCount}
        selectedDay={selectedDay}
        setCopyDaysOpen={setCopyDaysOpen}
        setEditor={setEditor}
        setInteractionError={setInteractionError}
        setSettingsOpen={setSettingsOpen}
        trip={trip}
        workspaceDayCount={workspace.days.length}
        workspaceError={Boolean(workspaceError)}
        variantControls={
          <RouteVariantControls
            activeVariantId={workspace.variant.id}
            comparisonBlockingReason={comparison.blockingReason}
            onCompare={() => {
              enterComparison();
              setMapExpanded(true);
            }}
            tripId={trip.id}
            variants={variants}
          />
        }
      />
      <PlannerMatrix
        compactMapEmptyState={compactMapEmptyState}
        compactMapLines={compactMapLines}
        compactMapMarkers={compactMapMarkers}
        compactMapViewportKey={compactMapViewportKey}
        comparison={comparison}
        decisionSummary={decisionSummary}
        decisionSummaryPanelOpen={decisionSummaryPanelOpen}
        containerRef={containerRef}
        dayCityLayerAvailable={dayCityLayerAvailable}
        dayMapLayer={dayMapLayer}
        dayMutationPending={dayMutationPending}
        dayRoute={dayRoute}
        deleteItem={deleteItem}
        fillDragging={fillDragging}
        fillSourceRight={fillSourceRight}
        focusCell={focusCell}
        gridTemplate={gridTemplate}
        handleCellKey={handleCellKey}
        insertDay={insertDay}
        isFillDragging={isFillDragging}
        mapEmptyState={mapEmptyState}
        mapLines={mapLines}
        mapMode={mapMode}
        mapMarkers={mapMarkers}
        mapViewportKey={mapViewportKey}
        moveItem={moveItem}
        onMapExpand={() => setMapExpanded(true)}
        onComparisonExit={exitComparison}
        onComparisonSheetOpen={() => setComparisonSheetOpen(true)}
        onDecisionSummaryOpen={() => setDecisionSummaryPanelOpen(true)}
        onDecisionSummaryPanelClose={() => setDecisionSummaryPanelOpen(false)}
        onDayMapLayerChange={setDayMapLayer}
        onEditMapItem={editMapItem}
        onMarkerClick={selectMarker}
        onMapModeChange={setMapMode}
        onMapSelectionClear={() => setSelectedItemId(undefined)}
        overviewRoute={overviewRoute}
        openEditorFromDoubleClick={openEditorFromDoubleClick}
        removeDay={removeDay}
        selectedCount={selectedCount}
        selectDay={selectDay}
        selectedDayRow={selectedDayRow}
        selectedMapItem={selectedMapItem}
        selectionAnchor={selectionAnchor}
        selectionEnd={selectionEnd}
        selectionEndRef={selectionEndRef}
        setEditor={setEditor}
        selectItem={selectItem}
        setSelectionEnd={setSelectionEnd}
        setSplit={setSplit}
        split={split}
        startFill={startFill}
        startRangeSelection={startRangeSelection}
        startResize={startResize}
        tripTitle={trip.title}
        visibleSelectionBounds={visibleSelectionBounds}
        workspace={workspace}
      />
      <PlannerSheets
        compactMapEmptyState={compactMapEmptyState}
        compactMapLines={compactMapLines}
        compactMapMarkers={compactMapMarkers}
        compactMapViewportKey={compactMapViewportKey}
        comparison={comparison}
        comparisonSheetOpen={comparisonSheetOpen}
        decisionSummary={decisionSummary}
        decisionSummarySheetOpen={decisionSummarySheetOpen}
        copyDaysOpen={copyDaysOpen}
        copyPending={copyMutation.isPending}
        dayCityLayerAvailable={dayCityLayerAvailable}
        dayMapLayer={dayMapLayer}
        dayRoute={dayRoute}
        editor={editor}
        mapExpanded={mapExpanded}
        mapEmptyState={mapEmptyState}
        mapLines={mapLines}
        mapMode={mapMode}
        mapMarkers={mapMarkers}
        mapViewportKey={mapViewportKey}
        onCopyDaysOpenChange={setCopyDaysOpen}
        onComparisonExit={exitComparison}
        onComparisonSheetOpenChange={(open) => {
          setComparisonSheetOpen(open);
          if (open) setDecisionSummarySheetOpen(false);
          setMapExpanded(!open);
        }}
        onDecisionSummarySheetOpenChange={(open) => {
          setDecisionSummarySheetOpen(open);
          if (open) setComparisonSheetOpen(false);
          setMapExpanded(!open);
        }}
        onCopyToSelectedDays={() => void copyToSelectedDays()}
        onDayMapLayerChange={setDayMapLayer}
        onEditorClose={() => setEditor(null)}
        onEditMapItem={editMapItem}
        onInteractionError={setInteractionError}
        onMapExpandedChange={(open) => {
          setMapExpanded(open);
          if (
            !open &&
            mapMode === "comparison" &&
            !comparisonSheetOpen &&
            !decisionSummarySheetOpen
          )
            exitComparison();
        }}
        onMarkerClick={selectMarker}
        onMapModeChange={setMapMode}
        onMapSelectionClear={() => setSelectedItemId(undefined)}
        onSettingsOpenChange={setSettingsOpen}
        onTargetDaysChange={setTargetDays}
        selectedItem={selectedMapItem}
        overviewRoute={overviewRoute}
        selectionSourceDayId={workspace.days[visibleSelectionBounds.top]?.id}
        settings={settings}
        settingsOpen={settingsOpen}
        targetDays={targetDays}
        tripId={trip.id}
        unavailableTransportModes={unavailableTransportModes}
        workspace={workspace}
      />
      <PlannerClearCellsDialog
        error={interactionError}
        itemCount={clearTargetItems.length}
        onCancel={() => setClearTargetItems([])}
        onConfirm={() => void confirmClearSelection()}
        pending={clearPending}
      />
    </PlannerWorkspaceEventBoundary>
  );
}
