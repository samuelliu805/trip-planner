"use client";

import { format, parseISO } from "date-fns";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { EditorState } from "@/features/itinerary/components/planner-config";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
import { PlannerMapShell } from "@/features/itinerary/components/planner-map-shell";
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-types";
import type { ItineraryItem, PlannerWorkspace, TransportMode } from "@/features/itinerary/types";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import type { OverviewRouteUi } from "@/features/routes/use-overview-route";
import type { DayMapLayer } from "@/features/routes/day-city-map";
import { RouteVariantComparisonSheet } from "@/features/variants/components/route-variant-comparison-sheet";
import { RouteVariantDecisionSummarySheet } from "@/features/variants/components/route-variant-decision-summary-sheet";
import { TripSettingsSheet } from "@/features/trips/components/trip-settings-sheet";
import type { VariantComparisonUi } from "@/features/variants/use-variant-comparison";
import type { VariantDecisionSummaryUi } from "@/features/variants/use-variant-decision-summary";

type PlannerSheetsProps = {
  compactMapEmptyState?: { message: string; title: string };
  compactMapLines: PlannerMapLine[];
  compactMapMarkers: PlannerMapMarker[];
  compactMapViewportKey?: string;
  comparison: VariantComparisonUi;
  comparisonSheetOpen: boolean;
  decisionSummary: VariantDecisionSummaryUi;
  decisionSummarySheetOpen: boolean;
  defaultCurrency: string;
  copyDaysOpen: boolean;
  copyPending: boolean;
  dayCityLayerAvailable: boolean;
  dayMapLayer: DayMapLayer;
  dayRoute: DayRouteUi;
  editor: EditorState | null;
  mapExpanded: boolean;
  mapEmptyState?: { message: string; title: string };
  mapLines: PlannerMapLine[];
  mapMode: PlannerMapMode;
  mapMarkers: PlannerMapMarker[];
  onCopyDaysOpenChange: (open: boolean) => void;
  onComparisonSheetOpenChange: (open: boolean) => void;
  onDecisionSummarySheetOpenChange: (open: boolean) => void;
  onCopyToSelectedDays: () => void;
  onDayMapLayerChange: (layer: DayMapLayer) => void;
  onEditorClose: () => void;
  onEditorDraftChange: (item: ItineraryItem | null) => void;
  onEditMapItem: (itemId: string) => void;
  onInteractionError: (message?: string) => void;
  onItemCreated: (item: ItineraryItem) => void;
  onMapExpandedChange: (open: boolean) => void;
  onMarkerClick: (id?: string) => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onMapSelectionClear: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  onTargetDaysChange: (days: Set<string>) => void;
  selectedItem?: ItineraryItem;
  overviewRoute: OverviewRouteUi;
  selectionSourceDayId?: string;
  settings: React.ReactNode;
  settingsOpen: boolean;
  targetDays: Set<string>;
  tripId: string;
  unavailableTransportModes: TransportMode[];
  mapViewportKey?: string;
  workspace: PlannerWorkspace;
};

export function PlannerSheets({
  compactMapEmptyState,
  compactMapLines,
  compactMapMarkers,
  compactMapViewportKey,
  comparison,
  comparisonSheetOpen,
  decisionSummary,
  decisionSummarySheetOpen,
  defaultCurrency,
  copyDaysOpen,
  copyPending,
  dayCityLayerAvailable,
  dayMapLayer,
  dayRoute,
  editor,
  mapExpanded,
  mapEmptyState,
  mapLines,
  mapMode,
  mapMarkers,
  onCopyDaysOpenChange,
  onComparisonSheetOpenChange,
  onDecisionSummarySheetOpenChange,
  onCopyToSelectedDays,
  onDayMapLayerChange,
  onEditorClose,
  onEditorDraftChange,
  onEditMapItem,
  onInteractionError,
  onItemCreated,
  onMapExpandedChange,
  onMarkerClick,
  onMapModeChange,
  onMapSelectionClear,
  onSettingsOpenChange,
  onTargetDaysChange,
  selectedItem,
  overviewRoute,
  selectionSourceDayId,
  settings,
  settingsOpen,
  targetDays,
  tripId,
  unavailableTransportModes,
  mapViewportKey,
  workspace,
}: PlannerSheetsProps) {
  return (
    <>
      <RouteVariantComparisonSheet
        comparison={comparison}
        onOpenChange={onComparisonSheetOpenChange}
        open={comparisonSheetOpen}
      />
      <RouteVariantDecisionSummarySheet
        activeVariantId={workspace.variant.id}
        onOpenChange={onDecisionSummarySheetOpenChange}
        open={decisionSummarySheetOpen}
        summary={decisionSummary}
      />
      <Sheet onOpenChange={(open) => !open && onEditorClose()} open={Boolean(editor)}>
        <SheetContent className="planner-editor-sheet">
          <SheetHeader>
            <SheetTitle>{editor?.item ? "Edit itinerary item" : "Add itinerary item"}</SheetTitle>
            <SheetDescription>
              <span className="sm:hidden">Add the details for this itinerary item.</span>
              <span className="hidden sm:inline">
                Press Enter to save, Tab to move between fields, or Escape to cancel.
              </span>
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">
            {editor ? (
              <PlannerItemForm
                dayId={editor.dayId}
                defaultCurrency={defaultCurrency}
                item={editor.item}
                onCancel={onEditorClose}
                onError={onInteractionError}
                onDraftChange={editor.item ? onEditorDraftChange : undefined}
                onSaved={(savedItem) => {
                  const created = !editor.item;
                  onEditorClose();
                  if (created) onItemCreated(savedItem);
                }}
                tripId={tripId}
                type={editor.type}
                unavailableTransportModes={unavailableTransportModes}
                variantId={workspace.variant.id}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet onOpenChange={onMapExpandedChange} open={mapExpanded}>
        <SheetContent className="planner-map-sheet h-[86dvh] max-h-none p-0" side="bottom">
          <SheetHeader className="py-4">
            <SheetTitle>{selectedItem?.title ?? "Itinerary map"}</SheetTitle>
            <SheetDescription>Saved places from your itinerary.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <PlannerMapShell
              comparison={comparison}
              decisionSummary={decisionSummary}
              decisionSummaryPanelOpen={false}
              dayCityLayerAvailable={dayCityLayerAvailable}
              dayMapLayer={dayMapLayer}
              dayRoute={dayRoute}
              days={workspace.days}
              emptyState={
                mapMode === "comparison" ? (compactMapEmptyState ?? mapEmptyState) : mapEmptyState
              }
              lines={mapMode === "comparison" ? compactMapLines : mapLines}
              mapMode={mapMode}
              markers={mapMode === "comparison" ? compactMapMarkers : mapMarkers}
              onComparisonSheetOpen={() => onComparisonSheetOpenChange(true)}
              onDecisionSummaryOpen={() => onDecisionSummarySheetOpenChange(true)}
              onDecisionSummaryPanelClose={() => undefined}
              onMarkerClick={onMarkerClick}
              onDayMapLayerChange={onDayMapLayerChange}
              onEditMapItem={onEditMapItem}
              onMapModeChange={onMapModeChange}
              onMapSelectionClear={onMapSelectionClear}
              overviewRoute={overviewRoute}
              selectedId={selectedItem?.id}
              selectedItem={selectedItem}
              viewportKey={mapMode === "comparison" ? compactMapViewportKey : mapViewportKey}
            />
          </div>
        </SheetContent>
      </Sheet>
      <TripSettingsSheet onOpenChange={onSettingsOpenChange} open={settingsOpen}>
        {settings}
      </TripSettingsSheet>
      <Sheet onOpenChange={onCopyDaysOpenChange} open={copyDaysOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Copy to days</SheetTitle>
            <SheetDescription>
              Create independent copies on each selected destination day.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-2 overflow-y-auto p-5">
            {workspace.days.map((day) => {
              const source = day.id === selectionSourceDayId;
              return (
                <label
                  className={`flex min-h-11 items-center gap-3 rounded-md border px-3 text-sm ${source ? "opacity-50" : ""}`}
                  key={day.id}
                >
                  <Checkbox
                    checked={source ? false : targetDays.has(day.id)}
                    disabled={source || copyPending}
                    onCheckedChange={(checked) => {
                      const next = new Set(targetDays);
                      if (checked) next.add(day.id);
                      else next.delete(day.id);
                      onTargetDaysChange(next);
                    }}
                  />
                  Day {day.day_number} ·{" "}
                  {day.date ? format(parseISO(day.date), "MMM d") : "Date TBD"}
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 border-t p-4">
            <Button
              disabled={copyPending}
              onClick={() => onCopyDaysOpenChange(false)}
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              aria-busy={copyPending}
              disabled={!targetDays.size || copyPending}
              onClick={onCopyToSelectedDays}
            >
              {copyPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              {copyPending ? "Copying…" : "Copy items"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
