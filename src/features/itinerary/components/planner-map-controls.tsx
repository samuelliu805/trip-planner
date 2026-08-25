"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { GitCompareArrows, Maximize2, PanelBottomOpen } from "lucide-react";
import { useId } from "react";

import type { PlannerMapMode } from "@/features/itinerary/components/planner-map-types";
import type { DayMapLayer } from "@/features/routes/day-city-map";

export function PlannerMapControls({
  compact,
  comparisonBlockingReason,
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
  comparisonBlockingReason?: string;
  dayCityLayerAvailable: boolean;
  dayMapLayer: DayMapLayer;
  mapMode: PlannerMapMode;
  onDayMapLayerChange: (layer: DayMapLayer) => void;
  onExpand?: () => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onPanelOpen: () => void;
  panelDismissed: boolean;
}) {
  const { t } = useI18n();
  const comparisonReasonId = useId();
  return (
    <>
      {onExpand ? (
        <button
          aria-label="Open full-screen map"
          data-i18n-aria-label={"Open full-screen map"}
          className="absolute right-2 top-2 z-20 flex min-h-11 items-center justify-center gap-1.5 rounded-md border bg-background/95 px-3 text-xs font-medium shadow-sm backdrop-blur hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onExpand}
          type="button"
        >
          <Maximize2 className="size-4" />
          <T message={" Open map "} />
        </button>
      ) : null}
      {!compact ? (
        <div className="absolute left-2 top-2 z-20 max-w-[calc(100%-1rem)] overflow-hidden rounded-lg border bg-background/95 shadow-sm backdrop-blur">
          <div
            aria-label="Map scope"
            data-i18n-aria-label={"Map scope"}
            className="flex p-0.5"
            role="group"
          >
            {(
              [
                { description: "Show the whole trip", label: "Whole trip", value: "overview" },
                { description: "Show the selected day", label: "This day", value: "day_route" },
                {
                  description:
                    comparisonBlockingReason ??
                    (mapMode === "day_route"
                      ? "Compare this Day route across variants"
                      : "Compare route variants by Activity city/town stages"),
                  disabled: Boolean(comparisonBlockingReason),
                  label: "Compare",
                  value: "comparison",
                },
              ] as const
            ).map(({ description, label, value, ...item }) => {
              const disabled = "disabled" in item && item.disabled;
              return (
                <span className="flex" key={value} title={disabled ? t(description) : undefined}>
                  <button
                    aria-describedby={disabled ? comparisonReasonId : undefined}
                    aria-label={t(description)}
                    aria-pressed={mapMode === value}
                    className={`flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 ${mapMode === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                    disabled={disabled}
                    onClick={() => onMapModeChange(value)}
                    title={t(description)}
                    type="button"
                  >
                    {value === "comparison" ? (
                      <GitCompareArrows aria-hidden="true" className="size-3.5" />
                    ) : null}
                    <Localized value={label} />
                  </button>
                </span>
              );
            })}
          </div>
          {comparisonBlockingReason ? (
            <span className="sr-only" id={comparisonReasonId}>
              <Localized value={comparisonBlockingReason} />
            </span>
          ) : null}
          {mapMode === "day_route" && dayCityLayerAvailable ? (
            <div
              aria-label="Day map content"
              data-i18n-aria-label={"Day map content"}
              className="flex overflow-x-auto border-t p-0.5"
              role="group"
            >
              {(
                [
                  { description: "Show cities and places", label: "All items", value: "all" },
                  { description: "Show cities for this day", label: "Cities", value: "cities" },
                  { description: "Show places for this day", label: "Places", value: "places" },
                ] as const
              ).map(({ description, label, value }) => (
                <button
                  aria-label={t(description)}
                  aria-pressed={dayMapLayer === value}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${dayMapLayer === value ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70"}`}
                  key={value}
                  onClick={() => onDayMapLayerChange(value)}
                  title={t(description)}
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
                  <Localized value={label} />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {!compact && panelDismissed ? (
        <button
          aria-label="Open map details"
          data-i18n-aria-label={"Open map details"}
          className="map-panel-reopen absolute left-3 z-20 flex size-11 items-center justify-center rounded-full border bg-background/95 p-0 text-foreground shadow-lg backdrop-blur hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onPanelOpen}
          title="Open map details"
          data-i18n-title={"Open map details"}
          type="button"
        >
          <PanelBottomOpen className="size-5 text-primary" />
        </button>
      ) : null}
    </>
  );
}
