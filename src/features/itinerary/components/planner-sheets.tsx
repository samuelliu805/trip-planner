"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
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
import { PlannerItemEditorDialog } from "@/features/itinerary/components/planner-item-editor-dialog";
import type { PlannerItemSaveFeedback } from "@/features/itinerary/components/planner-item-save-feedback";
import { PlannerMapShell } from "@/features/itinerary/components/planner-map-shell";
import type {
  PlannerMapMode,
  PlannerMapModeChange,
} from "@/features/itinerary/components/planner-map-types";
import type { ItineraryItem, PlannerWorkspace, TransportMode } from "@/features/itinerary/types";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import type { OverviewRouteUi } from "@/features/routes/use-overview-route";
import type { DayMapLayer } from "@/features/routes/day-city-map";
import { RouteVariantComparisonSheet } from "@/features/variants/components/route-variant-comparison-sheet";
import { RouteVariantDecisionSummarySheet } from "@/features/variants/components/route-variant-decision-summary-sheet";
import { TripSettingsEditor } from "@/features/trips/components/trip-settings-editor";
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
  onItemSaveFeedback: (feedback?: PlannerItemSaveFeedback) => void;
  onMapExpandedChange: (open: boolean) => void;
  onMarkerClick: (id?: string) => void;
  onMapModeChange: PlannerMapModeChange;
  onMapSelectionClear: () => void;
  onSettingsOpenChange: (open: boolean) => void;
  onTargetDaysChange: (days: Set<string>) => void;
  selectedItem?: ItineraryItem;
  overviewRoute: OverviewRouteUi;
  selectionSourceDayId?: string;
  settings: React.ReactNode;
  settingsOpen: boolean;
  shareAttachmentsEnabled: boolean;
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
  onItemSaveFeedback,
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
  shareAttachmentsEnabled,
  targetDays,
  tripId,
  unavailableTransportModes,
  mapViewportKey,
  workspace,
}: PlannerSheetsProps) {
  const { locale } = useI18n();
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
      <PlannerItemEditorDialog
        dayDate={workspace.days.find(({ id }) => id === editor?.dayId)?.date ?? ""}
        dayItems={workspace.days.find(({ id }) => id === editor?.dayId)?.items ?? []}
        defaultCurrency={defaultCurrency}
        editor={editor}
        onClose={onEditorClose}
        onDraftChange={onEditorDraftChange}
        onError={onInteractionError}
        onSaveFeedback={onItemSaveFeedback}
        shareAttachmentsEnabled={shareAttachmentsEnabled}
        tripId={tripId}
        unavailableTransportModes={unavailableTransportModes}
        variantId={workspace.variant.id}
      />
      <Sheet onOpenChange={onMapExpandedChange} open={mapExpanded}>
        <SheetContent className="planner-map-sheet p-0" side="right">
          <SheetHeader className="py-5">
            <SheetTitle className="text-lg">
              <T message={"Map & routes"} />
            </SheetTitle>
            {selectedItem?.title ? (
              <SheetDescription>{selectedItem.title}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">
                <T message={"Map & routes"} />
              </SheetDescription>
            )}
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
      <TripSettingsEditor
        description="Rename the trip, change its length, or adjust its dates and currency."
        onOpenChange={onSettingsOpenChange}
        open={settingsOpen}
        title="Trip settings"
      >
        {settings}
      </TripSettingsEditor>
      <Sheet onOpenChange={onCopyDaysOpenChange} open={copyDaysOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              <T message={"Copy to days"} />
            </SheetTitle>
            <SheetDescription>
              <T message={" Create independent copies on each selected destination day. "} />
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
                  <T message={"Day {day}"} values={{ day: day.day_number }} /> ·{" "}
                  {day.date ? (
                    format(parseISO(day.date), locale === "zh-CN" ? "M月d日" : "MMM d", {
                      locale: locale === "zh-CN" ? zhCN : undefined,
                    })
                  ) : (
                    <T message="Date TBD" />
                  )}
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
              <T message={" Cancel "} />
            </Button>
            <Button
              aria-busy={copyPending}
              disabled={!targetDays.size || copyPending}
              onClick={onCopyToSelectedDays}
            >
              {copyPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              <Localized value={copyPending ? "Copying…" : "Copy items"} />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
