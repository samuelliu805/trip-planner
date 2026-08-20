"use client";

import { LoaderCircle, RotateCcw, Route, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PullUpPanelHandle } from "@/components/ui/pull-up-panel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { overviewRouteModeLabels } from "./overview-transport";
import { RouteIconButton } from "./route-icon-button";
import { RouteLegDetails } from "./route-leg-details";
import { overviewRouteModes, type OverviewRouteMode } from "./types";
import type { OverviewRouteUi } from "./use-overview-route";

const notSetValue = "not_set";

const formatDistance = (meters: number) =>
  meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${Math.round(meters)} m`;

const formatDuration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`;
};

export function OverviewRouteOverlay({
  onClose,
  route,
  selectedPlace,
}: {
  onClose: () => void;
  route: OverviewRouteUi;
  selectedPlace?: React.ReactNode;
}) {
  if (!route.segments.length)
    return selectedPlace ? (
      <section className="overview-route-panel mobile-pull-up-panel absolute bottom-3 left-3 right-3 z-20 rounded-xl border bg-background/95 px-3 pb-3 pr-12 shadow-lg backdrop-blur">
        <PullUpPanelHandle onClose={onClose} />
        {selectedPlace}
        <RouteIconButton
          className="absolute right-2 top-2"
          label="Close Overview panel"
          onClick={onClose}
          title="Close panel"
        >
          <X className="size-4" />
        </RouteIconButton>
      </section>
    ) : null;
  const calculatedCount = route.segments.filter(({ calculatedLeg }) => calculatedLeg).length;
  const hasConfiguration = route.segments.some(({ calculatedLeg, mode }) => calculatedLeg || mode);
  const hasPendingCalculation = route.segments.some(({ calculatedLeg, mode }) =>
    Boolean(mode && !calculatedLeg),
  );
  const legDetails = route.segments.flatMap(({ calculatedLeg, from, to }) =>
    calculatedLeg
      ? [
          {
            ...calculatedLeg,
            fromLabel: from.entries[0].title,
            toLabel: to.entries[0].title,
          },
        ]
      : [],
  );

  return (
    <section className="overview-route-panel mobile-pull-up-panel absolute bottom-3 left-3 right-3 z-20 flex max-h-[62dvh] flex-col overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur min-[900px]:max-h-[calc(100%-4.5rem)]">
      <PullUpPanelHandle onClose={onClose} />
      {selectedPlace ? <div className="shrink-0 border-b px-3 py-2">{selectedPlace}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="flex min-w-0 items-center gap-2">
            <Route className="size-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">Overview route</p>
              <p className="truncate text-xs text-muted-foreground">
                {route.segments.length} stage{" "}
                {route.segments.length === 1 ? "connection" : "connections"}
                {calculatedCount
                  ? ` · ${calculatedCount}/${route.segments.length} calculated`
                  : " · Preview only"}
              </p>
            </div>
          </div>
          <Button
            className={
              route.editing
                ? "col-start-2 row-start-1"
                : "col-span-2 w-full sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:w-auto"
            }
            onClick={() => route.setEditing(!route.editing)}
            size="sm"
            type="button"
            variant={route.editing ? "outline" : hasPendingCalculation ? "default" : "outline"}
          >
            {route.editing ? "Done" : hasPendingCalculation ? "Set up route" : "Route details"}
          </Button>
          {!route.editing ? (
            <RouteIconButton
              className="col-start-2 row-start-1 sm:col-start-3 sm:row-start-1"
              label="Close Overview panel"
              onClick={onClose}
              title="Close panel"
            >
              <X className="size-4" />
            </RouteIconButton>
          ) : null}
        </div>

        {route.editing ? (
          <div className="mt-2 flex min-h-0 flex-1 flex-col border-t pt-2">
            <p className="mb-2 shrink-0 text-xs leading-4 text-muted-foreground sm:text-[11px]">
              Choose a travel mode for each stage connection. Calculation happens only when you
              select Calculate route; an unset connection keeps its straight preview line.
            </p>
            <ol
              aria-label="Overview route connections"
              className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 sm:max-h-56"
            >
              {route.segments.map((segment, index) => {
                const leg = segment.calculatedLeg;
                const duration =
                  leg?.durationSeconds === null
                    ? "Duration unavailable"
                    : leg?.durationSeconds !== undefined
                      ? `${leg.estimateKind === "transit_current_service" ? "Approx. " : ""}${formatDuration(leg.durationSeconds)}`
                      : segment.mode
                        ? "Ready to calculate"
                        : "Preview line";
                return (
                  <li
                    className="grid grid-cols-[minmax(0,1fr)_minmax(8.5rem,0.75fr)] items-center gap-2 rounded-lg border px-2.5 py-2"
                    key={`${segment.from.id}:${segment.to.id}`}
                  >
                    <div className="min-w-0 text-xs">
                      <p className="truncate font-medium">
                        {index + 1}. {segment.from.entries[0].title} → {segment.to.entries[0].title}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {segment.from.firstDayLabel} → {segment.to.firstDayLabel}
                        {leg ? ` · ${formatDistance(leg.distanceMeters)}` : ""} · {duration}
                      </p>
                    </div>
                    <Select
                      disabled={route.pending}
                      onValueChange={(value) =>
                        route.setMode(
                          segment.position,
                          value === notSetValue ? undefined : (value as OverviewRouteMode),
                        )
                      }
                      value={segment.mode ?? notSetValue}
                    >
                      <SelectTrigger
                        aria-label={`Travel from ${segment.from.entries[0].title} to ${segment.to.entries[0].title}`}
                        className="h-10"
                      >
                        <SelectValue placeholder="Select travel mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={notSetValue}>Not set · preview line</SelectItem>
                        {overviewRouteModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            {overviewRouteModeLabels[mode]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 flex shrink-0 flex-wrap justify-end gap-2">
              {hasConfiguration ? (
                <RouteIconButton
                  disabled={route.pending}
                  label="Reset Overview route"
                  onClick={route.reset}
                  title="Reset Overview route"
                >
                  <RotateCcw className="size-4" />
                </RouteIconButton>
              ) : null}
              <Button
                aria-busy={route.pending}
                disabled={route.pending || !hasPendingCalculation}
                onClick={() => void route.calculate()}
                size="sm"
                type="button"
              >
                {route.pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {route.pending
                  ? "Calculating…"
                  : hasPendingCalculation
                    ? "Calculate route"
                    : "Routes current"}
              </Button>
            </div>
          </div>
        ) : null}
        {!route.editing ? <RouteLegDetails legs={legDetails} /> : null}
        {route.error ? (
          <p
            className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive"
            role="alert"
          >
            {route.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
