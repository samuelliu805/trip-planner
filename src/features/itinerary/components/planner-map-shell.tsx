"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { PlannerMapControls } from "@/features/itinerary/components/planner-map-controls";
import { PlannerMapSelectedPlace } from "@/features/itinerary/components/planner-map-selected-place";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-types";
import type { ItineraryItem, PlannerDay } from "@/features/itinerary/types";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import { DayRouteOverlay } from "@/features/routes/day-route-overlay";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import { OverviewRouteOverlay } from "@/features/routes/overview-route-overlay";
import type { OverviewRouteUi } from "@/features/routes/use-overview-route";
import type { DayMapLayer } from "@/features/routes/day-city-map";
import { RouteVariantComparisonPanel } from "@/features/variants/components/route-variant-comparison-panel";
import { RouteVariantDecisionSummaryPanel } from "@/features/variants/components/route-variant-decision-summary-panel";
import { VariantComparisonMapStatus } from "@/features/variants/components/variant-comparison-feedback";
import { VariantComparisonMobileBar } from "@/features/variants/components/variant-comparison-mobile-bar";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";
import type { VariantDecisionSummaryUi } from "@/features/variants/use-variant-decision-summary";

const PlannerMapCanvas = dynamic(
  () => import("@/features/maps/planner-map-canvas").then((module) => module.PlannerMapCanvas),
  { ssr: false },
);

export function PlannerMapShell({
  compact = false,
  comparison,
  decisionSummary,
  decisionSummaryPanelOpen,
  dayCityLayerAvailable,
  dayMapLayer,
  dayRoute,
  days,
  emptyState,
  lines = [],
  mapMode,
  markers,
  onComparisonSheetOpen,
  onDecisionSummaryOpen,
  onDecisionSummaryPanelClose,
  onExpand,
  onEditMapItem,
  onDayMapLayerChange,
  onMapModeChange,
  onMapSelectionClear,
  onMarkerClick,
  overviewRoute,
  selectedId,
  selectedItem,
  viewportKey,
}: {
  compact?: boolean;
  comparison: VariantComparisonUi;
  decisionSummary: VariantDecisionSummaryUi;
  decisionSummaryPanelOpen: boolean;
  dayCityLayerAvailable: boolean;
  dayMapLayer: DayMapLayer;
  dayRoute: DayRouteUi;
  days: PlannerDay[];
  emptyState?: { message: string; title: string };
  lines?: PlannerMapLine[];
  mapMode: PlannerMapMode;
  markers: PlannerMapMarker[];
  onComparisonSheetOpen: () => void;
  onDecisionSummaryOpen: () => void;
  onDecisionSummaryPanelClose: () => void;
  onExpand?: () => void;
  onEditMapItem: (itemId: string) => void;
  onDayMapLayerChange: (layer: DayMapLayer) => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onMapSelectionClear: () => void;
  onMarkerClick: (id?: string) => void;
  overviewRoute: OverviewRouteUi;
  selectedId?: string;
  selectedItem?: ItineraryItem;
  viewportKey?: string;
}) {
  const activeDayId = dayRoute.activeDay?.id ?? "no-day";
  const [overviewPanelOpen, setOverviewPanelOpen] = useState(true);
  const [dayPanelState, setDayPanelState] = useState<{
    dayId: string;
    open: boolean;
  } | null>(null);
  const storedDayPanelOpen = dayPanelState?.dayId === activeDayId ? dayPanelState.open : true;
  const overviewPanelVisible = Boolean(overviewRoute.editing || overviewPanelOpen);
  const dayPanelOpen = Boolean(dayRoute.editing || storedDayPanelOpen);
  const panelDismissed =
    mapMode === "overview"
      ? !overviewPanelVisible
      : mapMode === "comparison"
        ? false
        : !dayPanelOpen;
  const setDayPanelOpen = (open: boolean) => setDayPanelState({ dayId: activeDayId, open });
  const handleMarkerClick = (id?: string) => {
    if (id) {
      if (mapMode === "day_route") setDayPanelOpen(false);
      else setOverviewPanelOpen(false);
    }
    onMarkerClick(id);
  };
  const closeOverviewPanel = () => {
    setOverviewPanelOpen(false);
    overviewRoute.setEditing(false);
    onMapSelectionClear();
  };
  const closeDayPanel = () => {
    setDayPanelOpen(false);
    onMapSelectionClear();
  };
  const closeSelectedPlace = () => {
    if (mapMode === "day_route") setDayPanelOpen(false);
    else setOverviewPanelOpen(false);
    onMapSelectionClear();
  };
  const visibleMarkers = markers;
  const selectedMarker = selectedId
    ? visibleMarkers.find(({ itemIds }) => itemIds.includes(selectedId))
    : undefined;
  const selectedPlace =
    selectedId && selectedMarker && mapMode !== "comparison" ? (
      <PlannerMapSelectedPlace
        dayRoute={dayRoute}
        days={days}
        item={selectedItem}
        mapMode={mapMode}
        marker={selectedMarker}
        onClose={closeSelectedPlace}
        onEditMapItem={onEditMapItem}
        onMarkerClick={handleMarkerClick}
        selectedId={selectedId}
      />
    ) : undefined;
  return (
    <section
      aria-label="Itinerary map"
      className="relative h-full min-w-0 overflow-hidden bg-muted/40"
    >
      <PlannerMapCanvas
        compact={compact}
        emptyState={emptyState}
        lines={selectedId ? [] : lines}
        markers={visibleMarkers}
        onMarkerClick={handleMarkerClick}
        selectedId={selectedId}
        viewportKey={viewportKey}
      />
      <PlannerMapControls
        compact={compact}
        comparisonBlockingReason={comparison.blockingReason}
        dayCityLayerAvailable={dayCityLayerAvailable}
        dayMapLayer={dayMapLayer}
        mapMode={mapMode}
        onDayMapLayerChange={onDayMapLayerChange}
        onExpand={onExpand}
        onMapModeChange={(mode) => {
          if (mode === "day_route") setDayPanelOpen(true);
          else setOverviewPanelOpen(true);
          onMapModeChange(mode);
        }}
        onPanelOpen={() => {
          if (mapMode === "overview") setOverviewPanelOpen(true);
          else if (mapMode === "day_route") setDayPanelOpen(true);
        }}
        panelDismissed={panelDismissed && !selectedId}
      />
      {!compact && selectedPlace ? (
        <section className="map-place-panel absolute bottom-3 left-3 right-3 z-20 max-h-[min(28rem,calc(100%-4.5rem))] overflow-y-auto rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
          {selectedPlace}
        </section>
      ) : null}
      {!compact && !selectedId && mapMode === "overview" && overviewPanelVisible ? (
        <OverviewRouteOverlay onClose={closeOverviewPanel} route={overviewRoute} />
      ) : null}
      {!compact && !selectedId && mapMode === "day_route" && dayPanelOpen ? (
        <DayRouteOverlay onClose={closeDayPanel} route={dayRoute} />
      ) : null}
      {mapMode === "comparison" ? (
        <>
          <VariantComparisonMapStatus comparison={comparison} />
          {!compact ? (
            <>
              <RouteVariantComparisonPanel
                comparison={comparison}
                onSummaryOpen={onDecisionSummaryOpen}
                summaryOpen={decisionSummaryPanelOpen}
              />
              <RouteVariantDecisionSummaryPanel
                activeVariantId={
                  comparison.presentations.find(({ isActive }) => isActive)?.variantId ?? ""
                }
                onCollapse={onDecisionSummaryPanelClose}
                open={decisionSummaryPanelOpen}
                summary={decisionSummary}
              />
              <VariantComparisonMobileBar
                comparison={comparison}
                onChooseRoutes={onComparisonSheetOpen}
                onSummaryOpen={onDecisionSummaryOpen}
              />
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
