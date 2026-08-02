"use client";

import { useIsMutating } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useEffect, useRef, useState } from "react";

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
  encodePlannerClipboard,
  parsePlannerClipboard,
  selectionBounds,
  type GridCoordinate,
} from "@/features/itinerary/grid-interactions";
import { usePlannerWorkspace } from "@/features/itinerary/queries";
import { usePlannerClipboard } from "@/features/itinerary/hooks/use-planner-clipboard";
import { usePlannerInteractions } from "@/features/itinerary/hooks/use-planner-interactions";
import { usePlannerMap } from "@/features/itinerary/hooks/use-planner-map";
import { usePlannerMutations } from "@/features/itinerary/hooks/use-planner-mutations";
import {
  normalizeTransportMode,
  type PlannerWorkspace as PlannerWorkspaceData,
} from "@/features/itinerary/types";
import type { Tables } from "@/types/database";

export function PlannerWorkspace({
  deleteError,
  initialWorkspace,
  settings,
  trip,
}: {
  deleteError: boolean;
  initialWorkspace: PlannerWorkspaceData;
  settings: React.ReactNode;
  trip: Tables<"trips">;
}) {
  const { data: workspace = initialWorkspace, error: workspaceError } = usePlannerWorkspace(
    trip.id,
    initialWorkspace,
  );
  const [split, setSplit] = useState(58);
  const [selectionAnchor, setSelectionAnchor] = useState<GridCoordinate>({ row: -1, column: -1 });
  const [selectionEnd, commitSelectionEnd] = useState<GridCoordinate>({ row: -1, column: -1 });
  const [selectedDayRow, setSelectedDayRow] = useState<number | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [interactionError, setInteractionError] = useState<string>();
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
  const itemCount = workspace.days.reduce((count, day) => count + day.items.length, 0);
  const dateRange =
    trip.start_date && trip.end_date
      ? `${format(parseISO(trip.start_date), "MMM d")} – ${format(parseISO(trip.end_date), "MMM d, yyyy")}`
      : `${trip.day_count} planning ${trip.day_count === 1 ? "day" : "days"} · Dates not set`;
  const gridTemplate = `minmax(520px, ${split}fr) 4px minmax(360px, ${100 - split}fr)`;

  const { dayMutationPending, deleteItem, insertDay, moveItem, removeDay } = usePlannerMutations(
    trip.id,
    setInteractionError,
  );

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
    mapMarkers,
    selectedMapItem,
    selectMarker,
    setSelectedItemId,
    toggleMarkerKind,
    visibleMarkerKinds,
  } = usePlannerMap(workspace, selectionEnd, setSelectionAnchor, setSelectionEnd);

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
    rangeJustSelected,
    selectionAnchor,
    selectionEnd,
    selectionEndRef,
    setEditor,
    setInteractionError,
    setIsFillDragging,
    setSelectedDayRow,
    setSelectedItemId,
    setSelectionAnchor,
    setSelectionEnd,
    setSplit,
    workspace,
  });

  return (
    <div
      className="planner-workspace flex h-full min-h-0 flex-col overflow-hidden bg-background"
      onCopy={(event) => {
        const payload = clipboardPayload();
        if (payload) {
          event.preventDefault();
          event.clipboardData.setData("text/plain", encodePlannerClipboard(payload));
          setInternalClipboard(payload);
          setInteractionError(undefined);
        }
      }}
      onPaste={(event) => {
        const payload =
          parsePlannerClipboard(event.clipboardData.getData("text/plain")) ?? internalClipboard;
        if (!payload) {
          setInteractionError(
            "Unsupported clipboard data. Copy cells from this planner before pasting.",
          );
          return;
        }
        event.preventDefault();
        void pastePayload(payload);
      }}
    >
      <PlannerToolbar
        activeCategory={activeCategory}
        activeCellAtCapacity={activeCellAtCapacity}
        activeDay={activeDay}
        copyPreviousDay={copyPreviousDay}
        copySelectionToClipboard={copySelectionToClipboard}
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
      />
      <PlannerMatrix
        containerRef={containerRef}
        dayMutationPending={dayMutationPending}
        deleteItem={deleteItem}
        fillDragging={fillDragging}
        fillSourceRight={fillSourceRight}
        focusCell={focusCell}
        gridTemplate={gridTemplate}
        handleCellKey={handleCellKey}
        insertDay={insertDay}
        isFillDragging={isFillDragging}
        mapMarkers={mapMarkers}
        moveItem={moveItem}
        onMapExpand={() => setMapExpanded(true)}
        onMarkerClick={selectMarker}
        onToggleMarkerKind={toggleMarkerKind}
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
        setSelectedItemId={setSelectedItemId}
        setSelectionAnchor={setSelectionAnchor}
        setSelectionEnd={setSelectionEnd}
        setSplit={setSplit}
        split={split}
        startFill={startFill}
        startRangeSelection={startRangeSelection}
        startResize={startResize}
        tripTitle={trip.title}
        visibleMarkerKinds={visibleMarkerKinds}
        visibleSelectionBounds={visibleSelectionBounds}
        workspace={workspace}
      />
      <PlannerSheets
        copyDaysOpen={copyDaysOpen}
        copyPending={copyMutation.isPending}
        editor={editor}
        mapExpanded={mapExpanded}
        mapMarkers={mapMarkers}
        onCopyDaysOpenChange={setCopyDaysOpen}
        onCopyToSelectedDays={() => void copyToSelectedDays()}
        onEditorClose={() => setEditor(null)}
        onInteractionError={setInteractionError}
        onMapExpandedChange={setMapExpanded}
        onMarkerClick={selectMarker}
        onSettingsOpenChange={setSettingsOpen}
        onTargetDaysChange={setTargetDays}
        onToggleMarkerKind={toggleMarkerKind}
        selectedItem={selectedMapItem}
        selectionSourceDayId={workspace.days[visibleSelectionBounds.top]?.id}
        settings={settings}
        settingsOpen={settingsOpen}
        targetDays={targetDays}
        tripId={trip.id}
        unavailableTransportModes={unavailableTransportModes}
        visibleMarkerKinds={visibleMarkerKinds}
        workspace={workspace}
      />
    </div>
  );
}
