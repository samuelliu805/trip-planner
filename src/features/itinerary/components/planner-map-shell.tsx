"use client";

import { ChevronDown, Maximize2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { format, parseISO } from "date-fns";
import { useState } from "react";

import { mergeMarkerDateRanges } from "@/features/maps/marker-date-ranges";
import type {
  MarkerKind,
  PlannerMapLine,
  PlannerMapMarker,
} from "@/features/maps/planner-map-canvas";
import type { PlannerDay } from "@/features/itinerary/types";
import { Button } from "@/components/ui/button";
import { DayRouteOverlay } from "@/features/routes/day-route-overlay";
import type { DayRouteUi } from "@/features/routes/use-day-route";
import { OverviewRouteOverlay } from "@/features/routes/overview-route-overlay";
import type { OverviewRouteUi } from "@/features/routes/use-overview-route";
import type { DayMapLayer } from "@/features/routes/day-city-map";

const markerKindLabels: Record<MarkerKind, string> = {
  city: "Cities",
  activity: "Activities",
  hotel: "Hotels",
  carRental: "Car rentals",
  meal: "Meals",
};

export const allMarkerKinds = Object.keys(markerKindLabels) as MarkerKind[];
export type PlannerMapMode = "overview" | "day_route";

export function buildPlannerMapMarkers(days: PlannerDay[]) {
  const grouped = new Map<string, PlannerMapMarker>();
  for (const day of days)
    for (const item of day.items) {
      if (!item.place || ["transport", "flight", "train", "note"].includes(item.type)) continue;
      const entry: PlannerMapMarker["entries"][number] = {
        dayLabel: day.date ? format(parseISO(day.date), "MMM d") : `Day ${day.day_number}`,
        dayNumber: day.day_number,
        itemId: item.id,
        kind:
          item.type === "location"
            ? "city"
            : item.type === "activity"
              ? "activity"
              : item.type === "hotel"
                ? "hotel"
                : item.type === "car_rental"
                  ? "carRental"
                  : item.type === "meal"
                    ? "meal"
                    : "carRental",
        title: item.title,
      };
      const groupKey = `${item.place.id}:${entry.kind}`;
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.entries.push(entry);
        existing.itemIds.push(item.id);
      } else {
        grouped.set(groupKey, {
          address: item.place.formattedAddress,
          entries: [entry],
          id: groupKey,
          itemIds: [item.id],
          latitude: item.place.latitude,
          longitude: item.place.longitude,
        });
      }
    }
  return [...grouped.values()];
}

const PlannerMapCanvas = dynamic(
  () => import("@/features/maps/planner-map-canvas").then((module) => module.PlannerMapCanvas),
  { ssr: false },
);

function SelectedPlaceContent({
  dayRoute,
  mapMode,
  marker,
  onClear,
  onEditMapItem,
  onMarkerClick,
  selectedId,
}: {
  dayRoute: DayRouteUi;
  mapMode: PlannerMapMode;
  marker: PlannerMapMarker;
  onClear?: () => void;
  onEditMapItem: (itemId: string) => void;
  onMarkerClick: (id?: string) => void;
  selectedId: string;
}) {
  const entry = marker.entries.find(({ itemId }) => itemId === selectedId);
  if (!entry) return null;
  const dayCount = new Set(marker.entries.map(({ dayNumber }) => dayNumber)).size;
  const dateRanges = mergeMarkerDateRanges(marker.entries);
  const staySummary =
    entry.kind === "hotel"
      ? `Total ${dayCount} ${dayCount === 1 ? "day" : "days"} at this hotel`
      : entry.kind === "city"
        ? `Total ${dayCount} ${dayCount === 1 ? "day" : "days"} in this city`
        : null;
  const eventSummary =
    entry.kind === "activity"
      ? `${marker.entries.length} ${marker.entries.length === 1 ? "activity" : "activities"} here`
      : entry.kind === "meal"
        ? `${marker.entries.length} ${marker.entries.length === 1 ? "meal" : "meals"} here`
        : `${marker.entries.length} car rental ${marker.entries.length === 1 ? "event" : "events"} here`;
  const eligibleDayStop = ["activity", "hotel", "meal"].includes(entry.kind);

  return (
    <div aria-live="polite">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{entry.title}</p>
          {marker.address ? (
            <p className="truncate text-xs text-muted-foreground">{marker.address}</p>
          ) : null}
        </div>
        {onClear ? (
          <button
            aria-label="Deselect place"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClear}
            type="button"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {marker.summary ? (
        <p className="mt-1 text-xs font-medium">{marker.summary}</p>
      ) : staySummary ? (
        <p className="mt-1 text-xs">
          <span className="font-medium">{staySummary}</span>
          <span className="text-muted-foreground"> · {dateRanges}</span>
        </p>
      ) : marker.entries.length === 1 ? (
        <p className="mt-1 text-xs text-muted-foreground">{entry.dayLabel}</p>
      ) : (
        <details className="group mt-2 border-t pt-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium marker:content-none">
            <span>{eventSummary}</span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-2 max-h-36 overflow-y-auto rounded-md border bg-background/80">
            {marker.entries.map((candidate) => (
              <button
                aria-current={candidate.itemId === selectedId ? "true" : undefined}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b px-2.5 py-1.5 text-left text-xs last:border-b-0 ${candidate.itemId === selectedId ? "bg-primary/10 font-medium" : "hover:bg-muted"}`}
                key={candidate.itemId}
                onClick={() => onMarkerClick(candidate.itemId)}
                type="button"
              >
                <span className="truncate">{candidate.title}</span>
                <span className="text-muted-foreground">{candidate.dayLabel}</span>
              </button>
            ))}
          </div>
        </details>
      )}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => onEditMapItem(entry.itemId)}
          size="sm"
          type="button"
          variant="outline"
        >
          Edit item
        </Button>
        {mapMode === "day_route" && eligibleDayStop ? (
          dayRoute.editing ? (
            dayRoute.draft?.itemIds.includes(entry.itemId) ? (
              <Button
                onClick={() => dayRoute.removeItem(entry.itemId)}
                size="sm"
                type="button"
                variant="outline"
              >
                Remove from route
              </Button>
            ) : (
              <Button onClick={() => dayRoute.addStop(entry.itemId)} size="sm" type="button">
                Add to route
              </Button>
            )
          ) : null
        ) : null}
      </div>
    </div>
  );
}

export function PlannerMapShell({
  compact = false,
  dayCityLayerAvailable,
  dayMapLayer,
  dayRoute,
  emptyState,
  lines = [],
  mapMode,
  markers,
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
  dayCityLayerAvailable: boolean;
  dayMapLayer: DayMapLayer;
  dayRoute: DayRouteUi;
  emptyState?: { message: string; title: string };
  lines?: PlannerMapLine[];
  mapMode: PlannerMapMode;
  markers: PlannerMapMarker[];
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
  const [dayPanelState, setDayPanelState] = useState<{
    dayId: string;
    open: boolean;
  } | null>(null);
  const storedDayPanelOpen = dayPanelState?.dayId === activeDayId ? dayPanelState.open : true;
  const dayPanelOpen = Boolean(selectedId || dayRoute.editing || storedDayPanelOpen);
  const setDayPanelOpen = (open: boolean) => setDayPanelState({ dayId: activeDayId, open });
  const handleMarkerClick = (id?: string) => {
    if (mapMode === "day_route" && id) setDayPanelOpen(true);
    onMarkerClick(id);
  };
  const closeDayPanel = () => {
    setDayPanelOpen(false);
    onMapSelectionClear();
    if (dayRoute.editing) dayRoute.cancelEditing();
  };
  const visibleMarkers = markers;
  const selectedMarker = selectedId
    ? visibleMarkers.find(({ itemIds }) => itemIds.includes(selectedId))
    : undefined;
  const selectedPlace =
    selectedId && selectedMarker ? (
      <SelectedPlaceContent
        dayRoute={dayRoute}
        mapMode={mapMode}
        marker={selectedMarker}
        onClear={mapMode === "overview" ? onMapSelectionClear : undefined}
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
      {onExpand ? (
        <button
          aria-label="Open full-screen map"
          className="absolute right-2 top-2 z-20 flex h-10 items-center justify-center gap-1.5 rounded-md border bg-background/95 px-3 text-xs font-medium shadow-sm backdrop-blur"
          onClick={onExpand}
          type="button"
        >
          <Maximize2 className="size-4" />
          Open map
        </button>
      ) : null}
      {!compact ? (
        <div
          aria-label="Map level"
          className="absolute left-2 top-2 z-20 flex rounded-lg border bg-background/95 p-0.5 shadow-sm backdrop-blur"
        >
          {(["overview", "day_route"] as const).map((mode) => (
            <button
              aria-pressed={mapMode === mode}
              className={`min-h-9 rounded-md px-3 text-xs font-medium ${mapMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              key={mode}
              onClick={() => {
                if (mode === "day_route") setDayPanelOpen(true);
                onMapModeChange(mode);
              }}
              type="button"
            >
              {mode === "overview" ? "Overview" : "Day route"}
            </button>
          ))}
        </div>
      ) : null}
      {!compact && mapMode === "day_route" && dayCityLayerAvailable ? (
        <div
          aria-label="Day map layers"
          className="absolute left-2 top-14 z-20 flex max-w-[calc(100%-1rem)] overflow-x-auto rounded-lg border bg-background/95 p-0.5 shadow-sm backdrop-blur"
        >
          {(
            [
              { label: "All", value: "all" },
              { label: "City transfers", value: "cities" },
              { label: "Day stops", value: "places" },
            ] as const
          ).map(({ label, value }) => (
            <button
              aria-pressed={dayMapLayer === value}
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium ${dayMapLayer === value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70"}`}
              key={value}
              onClick={() => onDayMapLayerChange(value)}
              type="button"
            >
              {value === "all" ? (
                <span aria-hidden="true" className="flex gap-0.5">
                  <span className="size-2 rounded-full bg-blue-600" />
                  <span className="size-2 rounded-full bg-green-800" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${value === "cities" ? "bg-blue-600" : "bg-green-800"}`}
                />
              )}
              {label}
            </button>
          ))}
        </div>
      ) : null}
      {!compact && mapMode === "overview" ? (
        <OverviewRouteOverlay route={overviewRoute} selectedPlace={selectedPlace} />
      ) : null}
      {!compact && mapMode === "day_route" && dayPanelOpen ? (
        <DayRouteOverlay onClose={closeDayPanel} route={dayRoute} selectedPlace={selectedPlace} />
      ) : null}
      {!compact && mapMode === "day_route" && !dayPanelOpen ? (
        <Button
          className="absolute bottom-3 right-3 z-20 shadow-lg"
          onClick={() => setDayPanelOpen(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          Show Route A panel
        </Button>
      ) : null}
    </section>
  );
}
