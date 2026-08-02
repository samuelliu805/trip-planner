"use client";

import { format, parseISO } from "date-fns";

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
import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-shell";
import type { ItineraryItem, PlannerWorkspace, TransportMode } from "@/features/itinerary/types";
import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-canvas";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import type { OverviewRouteUi } from "@/features/routes/use-overview-route";
import type { DayMapLayer } from "@/features/routes/day-city-map";

type PlannerSheetsProps = {
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
  onCopyToSelectedDays: () => void;
  onDayMapLayerChange: (layer: DayMapLayer) => void;
  onEditorClose: () => void;
  onEditMapItem: (itemId: string) => void;
  onInteractionError: (message?: string) => void;
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
  onCopyToSelectedDays,
  onDayMapLayerChange,
  onEditorClose,
  onEditMapItem,
  onInteractionError,
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
                item={editor.item}
                onCancel={onEditorClose}
                onError={onInteractionError}
                onSaved={onEditorClose}
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
              dayCityLayerAvailable={dayCityLayerAvailable}
              dayMapLayer={dayMapLayer}
              dayRoute={dayRoute}
              emptyState={mapEmptyState}
              lines={mapLines}
              mapMode={mapMode}
              markers={mapMarkers}
              onMarkerClick={onMarkerClick}
              onDayMapLayerChange={onDayMapLayerChange}
              onEditMapItem={onEditMapItem}
              onMapModeChange={onMapModeChange}
              onMapSelectionClear={onMapSelectionClear}
              overviewRoute={overviewRoute}
              selectedId={selectedItem?.id}
              viewportKey={mapViewportKey}
            />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet onOpenChange={onSettingsOpenChange} open={settingsOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Trip settings</SheetTitle>
            <SheetDescription>
              Update trip details without changing the generated date structure.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-5">{settings}</div>
        </SheetContent>
      </Sheet>
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
                    disabled={source}
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
            <Button onClick={() => onCopyDaysOpenChange(false)} variant="ghost">
              Cancel
            </Button>
            <Button disabled={!targetDays.size || copyPending} onClick={onCopyToSelectedDays}>
              Copy items
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
