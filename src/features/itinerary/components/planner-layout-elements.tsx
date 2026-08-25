"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { PlannerMapShell } from "@/features/itinerary/components/planner-map-shell";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-types";
import { categories } from "@/features/itinerary/components/planner-config";
import { MatrixGridHeader } from "@/features/itinerary/components/matrix-presentation";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import type { OverviewRouteUi } from "@/features/routes/use-overview-route";
import type { DayMapLayer } from "@/features/routes/day-city-map";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";
import type { VariantDecisionSummaryUi } from "@/features/variants/use-variant-decision-summary";

export function PlannerStatus({
  deleteError,
  fillLabel,
  fillThroughDay,
  interactionError,
  isEmpty,
  isFillDragging,
  onDismissError,
  workspaceError,
}: {
  deleteError: boolean;
  fillLabel: string;
  fillThroughDay?: number;
  interactionError?: string;
  isEmpty: boolean;
  isFillDragging: boolean;
  onDismissError: () => void;
  workspaceError: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      {interactionError ? (
        <div
          className="flex items-center justify-between border-b bg-destructive/10 px-4 py-1.5 text-xs text-destructive"
          role="alert"
        >
          <span>
            <Localized value={interactionError} />
          </span>
          <button className="underline" onClick={onDismissError} type="button">
            <T message={" Dismiss "} />
          </button>
        </div>
      ) : null}
      {workspaceError ? (
        <p className="border-b bg-destructive/10 px-4 py-2 text-xs text-destructive" role="alert">
          <T message={" The planner could not refresh. Your last loaded data remains visible. "} />
        </p>
      ) : null}
      {deleteError ? (
        <p className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive" role="alert">
          <T message={" The trip could not be deleted. "} />
        </p>
      ) : null}
      {isEmpty ? (
        <p className="border-b bg-primary/5 px-4 py-2 text-xs text-muted-foreground" role="status">
          <T message={" This itinerary is empty. Select a category cell, then choose Add item. "} />
        </p>
      ) : null}
      {isFillDragging ? (
        <div
          className="pointer-events-none fixed left-1/2 top-28 z-50 -translate-x-1/2 rounded-full border bg-background/95 px-4 py-2 text-xs font-medium shadow-lg backdrop-blur"
          role="status"
        >
          <T message={" Release to copy "} />
          {t("{label} through Day {day}. Only this column will change.", {
            day: fillThroughDay ?? "",
            label: t(fillLabel),
          })}
        </div>
      ) : null}
    </>
  );
}

export function PlannerMapPane({
  compactLines,
  compactEmptyState,
  compactMarkers,
  compactViewportKey,
  comparison,
  decisionSummary,
  decisionSummaryPanelOpen,
  dayCityLayerAvailable,
  dayMapLayer,
  dayRoute,
  days,
  emptyState,
  lines,
  mapMode,
  markers,
  onExpand,
  onComparisonSheetOpen,
  onDecisionSummaryOpen,
  onDecisionSummaryPanelClose,
  onEditMapItem,
  onDayMapLayerChange,
  onMarkerClick,
  onMapModeChange,
  onMapSelectionClear,
  overviewRoute,
  selectedId,
  selectedItem,
  viewportKey,
}: {
  compactEmptyState?: { message: string; title: string };
  compactLines: PlannerMapLine[];
  compactMarkers: PlannerMapMarker[];
  compactViewportKey?: string;
  comparison: VariantComparisonUi;
  decisionSummary: VariantDecisionSummaryUi;
  decisionSummaryPanelOpen: boolean;
  dayCityLayerAvailable: boolean;
  dayMapLayer: DayMapLayer;
  dayRoute: DayRouteUi;
  days: PlannerDay[];
  emptyState?: { message: string; title: string };
  lines: PlannerMapLine[];
  mapMode: PlannerMapMode;
  markers: PlannerMapMarker[];
  onExpand: () => void;
  onComparisonSheetOpen: () => void;
  onDecisionSummaryOpen: () => void;
  onDecisionSummaryPanelClose: () => void;
  onEditMapItem: (itemId: string) => void;
  onDayMapLayerChange: (layer: DayMapLayer) => void;
  onMarkerClick: (id?: string) => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onMapSelectionClear: () => void;
  overviewRoute: OverviewRouteUi;
  selectedId?: string;
  selectedItem?: ItineraryItem;
  viewportKey?: string;
}) {
  const map = (compact = false) => (
    <PlannerMapShell
      compact={compact}
      comparison={comparison}
      decisionSummary={decisionSummary}
      decisionSummaryPanelOpen={decisionSummaryPanelOpen}
      dayCityLayerAvailable={dayCityLayerAvailable}
      dayMapLayer={dayMapLayer}
      dayRoute={dayRoute}
      days={days}
      emptyState={compact ? (compactEmptyState ?? emptyState) : emptyState}
      lines={compact ? compactLines : lines}
      mapMode={mapMode}
      markers={compact ? compactMarkers : markers}
      onComparisonSheetOpen={onComparisonSheetOpen}
      onDecisionSummaryOpen={onDecisionSummaryOpen}
      onDecisionSummaryPanelClose={onDecisionSummaryPanelClose}
      onExpand={compact ? onExpand : undefined}
      onEditMapItem={onEditMapItem}
      onDayMapLayerChange={onDayMapLayerChange}
      onMarkerClick={onMarkerClick}
      onMapModeChange={onMapModeChange}
      onMapSelectionClear={onMapSelectionClear}
      overviewRoute={overviewRoute}
      selectedId={selectedId}
      selectedItem={selectedItem}
      viewportKey={compact ? (compactViewportKey ?? viewportKey) : viewportKey}
    />
  );
  return (
    <div className="planner-map-pane min-w-0">
      <div className="planner-map-landscape h-full">{map()}</div>
      <div className="planner-map-peek h-full">{map(true)}</div>
    </div>
  );
}

export function PlannerGridHeader() {
  return <MatrixGridHeader columns={categories} />;
}

export function PlannerDivider({
  onResize,
  onSplitChange,
  split,
}: {
  onResize: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSplitChange: (value: number) => void;
  split: number;
}) {
  return (
    <div
      aria-label="Resize matrix and map"
      data-i18n-aria-label={"Resize matrix and map"}
      aria-orientation="vertical"
      aria-valuemax={68}
      aria-valuemin={45}
      aria-valuenow={Math.round(split)}
      className="planner-divider relative z-40 cursor-col-resize bg-border hover:bg-primary focus-visible:bg-primary focus-visible:outline-none"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onSplitChange(Math.max(45, split - 2));
        if (event.key === "ArrowRight") onSplitChange(Math.min(68, split + 2));
      }}
      onPointerDown={onResize}
      role="separator"
      tabIndex={0}
    />
  );
}
