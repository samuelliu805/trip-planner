"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import { PlannerMapControls } from "@/features/itinerary/components/planner-map-controls";
import { PlannerMapSelectedPlace } from "@/features/itinerary/components/planner-map-selected-place";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-types";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import { DayRouteOverlay } from "@/features/routes/day-route-overlay";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import { OverviewRouteOverlay } from "@/features/routes/overview-route-overlay";
import type { OverviewRouteUi } from "@/features/routes/use-overview-route";
import type { DayMapLayer } from "@/features/routes/day-city-map";
import { RouteVariantComparisonPanel } from "@/features/variants/components/route-variant-comparison-panel";
import { VariantComparisonMapStatus } from "@/features/variants/components/variant-comparison-feedback";
import { VariantComparisonMobileBar } from "@/features/variants/components/variant-comparison-mobile-bar";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";

const PlannerMapCanvas = dynamic(
  () => import("@/features/maps/planner-map-canvas").then((module) => module.PlannerMapCanvas),
  { ssr: false },
);

export function PlannerMapShell({
  compact = false,
  comparison,
  dayCityLayerAvailable,
  dayMapLayer,
  dayRoute,
  emptyState,
  lines = [],
  mapMode,
  markers,
  onComparisonExit,
  onComparisonSheetOpen,
  onExpand,
  onEditMapItem,
  onDayMapLayerChange,
  onMapModeChange,
  onMapSelectionClear,
  onMarkerClick,
  overviewRoute,
  selectedId,
  viewportKey,
}: {
  compact?: boolean;
  comparison: VariantComparisonUi;
  dayCityLayerAvailable: boolean;
  dayMapLayer: DayMapLayer;
  dayRoute: DayRouteUi;
  emptyState?: { message: string; title: string };
  lines?: PlannerMapLine[];
  mapMode: PlannerMapMode;
  markers: PlannerMapMarker[];
  onComparisonExit: () => void;
  onComparisonSheetOpen: () => void;
  onExpand?: () => void;
  onEditMapItem: (itemId: string) => void;
  onDayMapLayerChange: (layer: DayMapLayer) => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onMapSelectionClear: () => void;
  onMarkerClick: (id?: string) => void;
  overviewRoute: OverviewRouteUi;
  selectedId?: string;
  viewportKey?: string;
}) {
  const activeDayId = dayRoute.activeDay?.id ?? "no-day";
  const [overviewPanelOpen, setOverviewPanelOpen] = useState(true);
  const [dayPanelState, setDayPanelState] = useState<{
    dayId: string;
    open: boolean;
  } | null>(null);
  const storedDayPanelOpen = dayPanelState?.dayId === activeDayId ? dayPanelState.open : true;
  const overviewPanelVisible = Boolean(selectedId || overviewRoute.editing || overviewPanelOpen);
  const dayPanelOpen = Boolean(selectedId || dayRoute.editing || storedDayPanelOpen);
  const panelDismissed =
    mapMode === "overview"
      ? !overviewPanelVisible
      : mapMode === "comparison"
        ? false
        : !dayPanelOpen;
  const setDayPanelOpen = (open: boolean) => setDayPanelState({ dayId: activeDayId, open });
  const handleMarkerClick = (id?: string) => {
    if (id) {
      if (mapMode === "day_route") setDayPanelOpen(true);
      else setOverviewPanelOpen(true);
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
  const visibleMarkers = markers;
  const selectedMarker = selectedId
    ? visibleMarkers.find(({ itemIds }) => itemIds.includes(selectedId))
    : undefined;
  const selectedPlace =
    selectedId && selectedMarker && mapMode !== "comparison" ? (
      <PlannerMapSelectedPlace
        dayRoute={dayRoute}
        mapMode={mapMode}
        marker={selectedMarker}
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
        lines={lines}
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
        panelDismissed={panelDismissed}
      />
      {!compact && mapMode === "overview" && overviewPanelVisible ? (
        <OverviewRouteOverlay
          onClose={closeOverviewPanel}
          route={overviewRoute}
          selectedPlace={selectedPlace}
        />
      ) : null}
      {!compact && mapMode === "day_route" && dayPanelOpen ? (
        <DayRouteOverlay onClose={closeDayPanel} route={dayRoute} selectedPlace={selectedPlace} />
      ) : null}
      {mapMode === "comparison" ? (
        <>
          <VariantComparisonMapStatus comparison={comparison} />
          {!compact ? (
            <>
              <RouteVariantComparisonPanel comparison={comparison} onExit={onComparisonExit} />
              <VariantComparisonMobileBar
                comparison={comparison}
                onChooseRoutes={onComparisonSheetOpen}
              />
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
