"use client";

import { Maximize2, PanelBottomOpen } from "lucide-react";

import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-types";
import type { DayMapLayer } from "@/features/routes/day-city-map";

export function PlannerMapControls({
  compact,
  dayCityLayerAvailable,
  dayMapLayer,
  mapMode,
  onDayMapLayerChange,
  onExpand,
  onMapModeChange,
  onPanelOpen,
  panelDismissed,
}: {
  compact: boolean;
  dayCityLayerAvailable: boolean;
  dayMapLayer: DayMapLayer;
  mapMode: PlannerMapMode;
  onDayMapLayerChange: (layer: DayMapLayer) => void;
  onExpand?: () => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onPanelOpen: () => void;
  panelDismissed: boolean;
}) {
  return (
    <>
      {onExpand ? (
        <button
          aria-label="Open full-screen map"
          className="absolute right-2 top-2 z-20 flex min-h-11 items-center justify-center gap-1.5 rounded-md border bg-background/95 px-3 text-xs font-medium shadow-sm backdrop-blur hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className={`min-h-11 rounded-md px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${mapMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
              key={mode}
              onClick={() => onMapModeChange(mode)}
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
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dayMapLayer === value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70"}`}
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
      {!compact && panelDismissed ? (
        <button
          aria-label={mapMode === "overview" ? "Open Overview panel" : "Open day route panel"}
          className="map-panel-reopen absolute left-3 z-20 flex min-h-11 items-center gap-2 rounded-full border bg-background/95 px-3 text-xs font-semibold text-foreground shadow-lg backdrop-blur hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onPanelOpen}
          title={mapMode === "overview" ? "Open Overview panel" : "Open day route panel"}
          type="button"
        >
          <PanelBottomOpen className="size-4 text-primary" />
          <span>{mapMode === "overview" ? "Overview details" : "Route details"}</span>
        </button>
      ) : null}
    </>
  );
}
