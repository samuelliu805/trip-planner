"use client";

import { ChevronDown, Maximize2 } from "lucide-react";
import dynamic from "next/dynamic";
import { format, parseISO } from "date-fns";

import { mergeMarkerDateRanges } from "@/features/maps/marker-date-ranges";
import type {
  MarkerKind,
  PlannerMapLine,
  PlannerMapMarker,
} from "@/features/maps/planner-map-canvas";
import type { PlannerDay } from "@/features/itinerary/types";

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

export function PlannerMapShell({
  compact = false,
  emptyState,
  lines = [],
  mapMode,
  markers,
  onExpand,
  onMapModeChange,
  onMarkerClick,
  selectedId,
  visibleKinds,
  onToggleKind,
}: {
  compact?: boolean;
  emptyState?: { message: string; title: string };
  lines?: PlannerMapLine[];
  mapMode: PlannerMapMode;
  markers: PlannerMapMarker[];
  onExpand?: () => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onMarkerClick: (id: string) => void;
  selectedId?: string;
  visibleKinds: Set<MarkerKind>;
  onToggleKind: (kind: MarkerKind) => void;
}) {
  const visibleMarkers =
    mapMode === "day_route" && visibleKinds.size
      ? markers.filter((marker) => visibleKinds.has(marker.entries[0].kind))
      : markers;
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
        onMarkerClick={onMarkerClick}
        selectedId={selectedId}
      />
      {!compact && selectedId
        ? (() => {
            const marker = visibleMarkers.find(({ itemIds }) => itemIds.includes(selectedId));
            const entry = marker?.entries.find(({ itemId }) => itemId === selectedId);
            const dayCount = new Set(marker?.entries.map(({ dayNumber }) => dayNumber)).size;
            const dateRanges = marker ? mergeMarkerDateRanges(marker.entries) : "";
            const staySummary =
              entry?.kind === "hotel"
                ? `Total ${dayCount} ${dayCount === 1 ? "day" : "days"} at this hotel`
                : entry?.kind === "city"
                  ? `Total ${dayCount} ${dayCount === 1 ? "day" : "days"} in this city`
                  : null;
            const eventSummary = entry
              ? entry.kind === "activity"
                ? `${marker?.entries.length} ${marker?.entries.length === 1 ? "activity" : "activities"} here`
                : entry.kind === "meal"
                  ? `${marker?.entries.length} ${marker?.entries.length === 1 ? "meal" : "meals"} here`
                  : `${marker?.entries.length} car rental ${marker?.entries.length === 1 ? "event" : "events"} here`
              : "";
            return marker && entry ? (
              <div
                className="absolute bottom-3 left-3 right-3 z-10 rounded-lg border bg-background/95 px-3 py-2 shadow-lg backdrop-blur"
                aria-live="polite"
              >
                <p className="truncate text-sm font-semibold">{entry.title}</p>
                {marker.address ? (
                  <p className="truncate text-xs text-muted-foreground">{marker.address}</p>
                ) : null}
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
              </div>
            ) : null;
          })()
        : null}
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
              onClick={() => onMapModeChange(mode)}
              type="button"
            >
              {mode === "overview" ? "Overview" : "Day route"}
            </button>
          ))}
        </div>
      ) : null}
      {!compact && mapMode === "day_route" ? (
        <div
          className="absolute left-2 top-14 z-20 flex max-w-[calc(100%-1rem)] flex-wrap gap-1 overflow-x-auto"
          aria-label="Map pin filters"
        >
          {allMarkerKinds.map((kind) => (
            <button
              aria-pressed={visibleKinds.has(kind)}
              className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm ${visibleKinds.has(kind) ? "border-primary bg-primary text-primary-foreground" : "bg-background/90 text-muted-foreground"}`}
              key={kind}
              onClick={() => onToggleKind(kind)}
              type="button"
            >
              {markerKindLabels[kind]}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
