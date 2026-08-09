"use client";

import { LoaderCircle } from "lucide-react";

import { ArrangeActivitiesSheet } from "./arrange-activities-sheet";
import { PlannerClearCellsDialog } from "./planner-clear-cells-dialog";
import { PlannerMatrix } from "./planner-matrix";
import { PlannerSheets } from "./planner-sheets";
import { PlannerToolbar } from "./planner-toolbar";
import { PlannerWorkspaceEventBoundary } from "./planner-workspace-event-boundary";
import type { PlannerWorkspaceProps } from "./planner-workspace-types";
import { usePlannerWorkspaceController } from "../hooks/use-planner-workspace-controller";
import { RouteVariantControls } from "../../variants/components/route-variant-controls";

export function PlannerWorkspace(props: PlannerWorkspaceProps) {
  return <PlannerWorkspaceVariant key={props.initialWorkspace.variant.id} {...props} />;
}

function PlannerWorkspaceVariant(props: PlannerWorkspaceProps) {
  const c = usePlannerWorkspaceController(props);

  return (
    <PlannerWorkspaceEventBoundary
      clipboardPayload={c.clipboard.clipboardPayload}
      internalClipboard={c.clipboard.internalClipboard}
      onClearRequest={c.requestClearSelection}
      pastePayload={c.clipboard.pastePayload}
      selectedItemCount={c.selectedItems.length}
      setInteractionError={c.setInteractionError}
      setInternalClipboard={c.clipboard.setInternalClipboard}
    >
      {c.clipboard.requestPending ? (
        <div
          aria-live="polite"
          className="fixed inset-0 z-[120] flex items-center justify-center bg-background/60 backdrop-blur-[1px]"
          role="status"
        >
          <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-2.5 text-sm font-medium shadow-lg">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-primary" />
            Updating selected cells…
          </div>
        </div>
      ) : null}
      <PlannerToolbar
        activeCategory={c.activeCategory}
        activeCellAtCapacity={c.activeCellAtCapacity}
        activeDay={c.activeDay}
        clearItemCount={c.selectedItems.length}
        clearPending={c.clearPending}
        copyPreviousDay={c.clipboard.copyPreviousDay}
        copySelectionToClipboard={c.clipboard.copySelectionToClipboard}
        dateRange={c.dateRange}
        dayMutationPending={c.dayMutationPending}
        deleteError={props.deleteError}
        fillLabel={c.fillLabel}
        fillThroughDay={c.workspace.days[c.selectionEnd.row]?.day_number}
        insertDay={c.insertDay}
        interactionError={c.interactionError}
        isEmpty={c.itemCount === 0}
        isFillDragging={c.isFillDragging}
        mutating={c.mutating}
        onArrangeActivities={(day) => c.setArrangeActivitiesRequest({ dayId: day.id })}
        pasteAvailableClipboard={c.clipboard.pasteAvailableClipboard}
        removeDay={c.removeDay}
        requestClearSelection={c.requestClearSelection}
        requestPending={c.clipboard.requestPending}
        selectedCount={c.selectedCount}
        selectedDay={c.selectedDay}
        setCopyDaysOpen={c.clipboard.setCopyDaysOpen}
        setEditor={c.setEditor}
        setInteractionError={c.setInteractionError}
        setSettingsOpen={c.setSettingsOpen}
        shareControls={props.shareControls}
        trip={props.trip}
        workspaceDayCount={c.projectedWorkspace.days.length}
        workspaceError={Boolean(c.workspaceError)}
        variantControls={
          <RouteVariantControls
            activeVariantId={c.workspace.variant.id}
            comparisonBlockingReason={c.map.comparison.blockingReason}
            onCompare={() => {
              c.map.enterComparison();
              c.setMapExpanded(true);
            }}
            tripId={props.trip.id}
            variants={c.variants}
          />
        }
      />
      <PlannerMatrix
        compactMapEmptyState={c.map.compactMapEmptyState}
        compactMapLines={c.map.compactMapLines}
        compactMapMarkers={c.map.compactMapMarkers}
        compactMapViewportKey={c.map.compactMapViewportKey}
        comparison={c.map.comparison}
        containerRef={c.containerRef}
        dayCityLayerAvailable={c.map.dayCityLayerAvailable}
        dayMapLayer={c.map.dayMapLayer}
        dayMutationPending={c.dayMutationPending}
        dayRoute={c.dayRoute}
        decisionSummary={c.map.decisionSummary}
        decisionSummaryPanelOpen={c.map.decisionSummaryPanelOpen}
        deleteItem={c.deleteItem}
        fillDragging={c.fillDragging}
        fillSourceRight={c.fillSourceRight}
        focusCell={c.interactions.focusCell}
        gridTemplate={c.gridTemplate}
        handleCellKey={c.interactions.handleCellKey}
        insertDay={c.insertDay}
        isFillDragging={c.isFillDragging}
        mapEmptyState={c.map.mapEmptyState}
        mapLines={c.map.mapLines}
        mapMarkers={c.map.mapMarkers}
        mapMode={c.map.mapMode}
        mapViewportKey={c.map.mapViewportKey}
        onArrangeActivities={(day) => c.setArrangeActivitiesRequest({ dayId: day.id })}
        onComparisonExit={c.map.exitComparison}
        onComparisonSheetOpen={() => c.map.setComparisonSheetOpen(true)}
        onDayMapLayerChange={c.map.setDayMapLayer}
        onDecisionSummaryOpen={() => c.map.setDecisionSummaryPanelOpen(true)}
        onDecisionSummaryPanelClose={() => c.map.setDecisionSummaryPanelOpen(false)}
        onEditMapItem={c.editMapItem}
        onMapExpand={() => c.setMapExpanded(true)}
        onMapModeChange={c.changeMapModeAndSelection}
        onMapSelectionClear={() => c.map.setSelectedItemId(undefined)}
        onMarkerClick={c.map.selectMarker}
        openEditorFromDoubleClick={c.interactions.openEditorFromDoubleClick}
        overviewRoute={c.map.overviewRoute}
        removeDay={c.removeDay}
        selectedCount={c.selectedCount}
        selectedDayRow={c.selectedDayRow}
        selectedMapItem={c.map.selectedMapItem}
        selectionAnchor={c.selectionAnchor}
        selectionEnd={c.selectionEnd}
        selectionEndRef={c.selectionEndRef}
        selectDay={c.interactions.selectDay}
        selectItem={c.interactions.selectItem}
        setEditor={c.setEditor}
        setSelectionEnd={c.setSelectionEnd}
        setSplit={c.setSplit}
        split={c.split}
        startFill={c.interactions.startFill}
        startRangeSelection={c.interactions.startRangeSelection}
        startResize={c.interactions.startResize}
        tripTitle={props.trip.title}
        visibleSelectionBounds={c.visibleSelectionBounds}
        workspace={c.projectedWorkspace}
      />
      <PlannerSheets
        compactMapEmptyState={c.map.compactMapEmptyState}
        compactMapLines={c.map.compactMapLines}
        compactMapMarkers={c.map.compactMapMarkers}
        compactMapViewportKey={c.map.compactMapViewportKey}
        comparison={c.map.comparison}
        comparisonSheetOpen={c.map.comparisonSheetOpen}
        copyDaysOpen={c.clipboard.copyDaysOpen}
        copyPending={c.clipboard.requestPending}
        dayCityLayerAvailable={c.map.dayCityLayerAvailable}
        dayMapLayer={c.map.dayMapLayer}
        dayRoute={c.dayRoute}
        decisionSummary={c.map.decisionSummary}
        decisionSummarySheetOpen={c.map.decisionSummarySheetOpen}
        editor={c.editor}
        mapEmptyState={c.map.mapEmptyState}
        mapExpanded={c.mapExpanded}
        mapLines={c.map.mapLines}
        mapMarkers={c.map.mapMarkers}
        mapMode={c.map.mapMode}
        mapViewportKey={c.map.mapViewportKey}
        onComparisonExit={c.map.exitComparison}
        onComparisonSheetOpenChange={(open) => {
          c.map.setComparisonSheetOpen(open);
          if (open) c.map.setDecisionSummarySheetOpen(false);
          c.setMapExpanded(!open);
        }}
        onCopyDaysOpenChange={c.clipboard.setCopyDaysOpen}
        onCopyToSelectedDays={() => void c.clipboard.copyToSelectedDays()}
        onDayMapLayerChange={c.map.setDayMapLayer}
        onDecisionSummarySheetOpenChange={(open) => {
          c.map.setDecisionSummarySheetOpen(open);
          if (open) c.map.setComparisonSheetOpen(false);
          c.setMapExpanded(!open);
        }}
        onEditMapItem={c.editMapItem}
        onEditorClose={() => {
          c.setEditor(null);
          c.setDraftItem(null);
        }}
        onEditorDraftChange={c.setDraftItem}
        onInteractionError={c.setInteractionError}
        onItemCreated={(item) => {
          if (["activity", "meal"].includes(item.type))
            c.setArrangeActivitiesRequest({
              dayId: item.day_id,
              initialMovingItemId: item.id,
            });
        }}
        onMapExpandedChange={(open) => {
          c.setMapExpanded(open);
          if (
            !open &&
            c.map.mapMode === "comparison" &&
            !c.map.comparisonSheetOpen &&
            !c.map.decisionSummarySheetOpen
          )
            c.map.exitComparison();
        }}
        onMapModeChange={c.changeMapModeAndSelection}
        onMapSelectionClear={() => c.map.setSelectedItemId(undefined)}
        onMarkerClick={c.map.selectMarker}
        onSettingsOpenChange={c.setSettingsOpen}
        onTargetDaysChange={c.clipboard.setTargetDays}
        overviewRoute={c.map.overviewRoute}
        selectedItem={c.map.selectedMapItem}
        selectionSourceDayId={c.workspace.days[c.visibleSelectionBounds.top]?.id}
        settings={props.settings}
        settingsOpen={c.settingsOpen}
        targetDays={c.clipboard.targetDays}
        tripId={props.trip.id}
        unavailableTransportModes={c.unavailableTransportModes}
        workspace={c.workspace}
      />
      <PlannerClearCellsDialog
        error={c.interactionError}
        itemCount={c.clearTargetItems.length}
        onCancel={() => c.setClearTargetItems([])}
        onConfirm={() => void c.confirmClearSelection()}
        pending={c.clearPending}
      />
      <ArrangeActivitiesSheet
        day={c.arrangeActivitiesDay}
        initialMovingItemId={c.arrangeActivitiesRequest?.initialMovingItemId}
        key={`${c.arrangeActivitiesRequest?.dayId ?? "closed"}:${c.arrangeActivitiesRequest?.initialMovingItemId ?? "manual"}`}
        onCommit={c.reorderItems}
        onInitialPlacementComplete={() => c.setArrangeActivitiesRequest(undefined)}
        onOpenChange={(open) => {
          if (!open) c.setArrangeActivitiesRequest(undefined);
        }}
        open={Boolean(c.arrangeActivitiesRequest)}
        pending={c.itemOrderPending}
      />
    </PlannerWorkspaceEventBoundary>
  );
}
