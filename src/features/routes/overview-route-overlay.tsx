"use client";

import { Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { overviewRouteModeLabels } from "./overview-transport";
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
  route,
  selectedPlace,
}: {
  route: OverviewRouteUi;
  selectedPlace?: React.ReactNode;
}) {
  if (!route.segments.length)
    return selectedPlace ? (
      <section className="overview-route-panel absolute bottom-3 left-3 right-3 z-20 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        {selectedPlace}
      </section>
    ) : null;
  const calculatedCount = route.segments.filter(({ calculatedLeg }) => calculatedLeg).length;
  const hasConfiguration = route.segments.some(({ calculatedLeg, mode }) => calculatedLeg || mode);
  const hasPendingCalculation = route.segments.some(({ calculatedLeg, mode }) =>
    Boolean(mode && !calculatedLeg),
  );

  return (
    <section className="overview-route-panel absolute bottom-3 left-3 right-3 z-20 overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      {selectedPlace ? <div className="border-b p-3">{selectedPlace}</div> : null}
      <div className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Route className="size-4 shrink-0 text-primary" />
          <div className="mr-auto min-w-0">
            <p className="truncate text-sm font-semibold">Overview route</p>
            <p className="text-xs text-muted-foreground">
              {route.segments.length} City{" "}
              {route.segments.length === 1 ? "connection" : "connections"}
              {calculatedCount
                ? ` · ${calculatedCount}/${route.segments.length} calculated`
                : " · Straight preview"}
            </p>
          </div>
          <Button
            onClick={() => route.setEditing(!route.editing)}
            size="sm"
            type="button"
            variant={route.editing ? "ghost" : "outline"}
          >
            {route.editing ? "Hide transport" : "Choose transport"}
          </Button>
        </div>

        <ol aria-label="Overview route leg times" className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {route.segments.map((segment) => {
            const leg = segment.calculatedLeg;
            const duration =
              leg?.durationSeconds === null
                ? "Duration unavailable"
                : leg?.durationSeconds !== undefined
                  ? `${leg.estimateKind === "transit_current_service" ? "Approx. " : ""}${formatDuration(leg.durationSeconds)}`
                  : segment.mode
                    ? "Not calculated"
                    : "Straight preview";
            return (
              <li
                className="min-w-44 max-w-60 flex-1 rounded-lg border bg-muted/40 px-2.5 py-2 text-[11px]"
                key={`summary:${segment.from.id}:${segment.to.id}`}
              >
                <p className="truncate font-medium">
                  {segment.from.entries[0].title} → {segment.to.entries[0].title}
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  {segment.mode ? overviewRouteModeLabels[segment.mode] : "Not set"}
                  {leg ? ` · ${formatDistance(leg.distanceMeters)}` : ""} · {duration}
                </p>
              </li>
            );
          })}
        </ol>

        {route.editing ? (
          <div className="mt-3 border-t pt-3">
            <p className="mb-2 text-[11px] text-muted-foreground">
              Defaults come from the arrival day&apos;s Transport items and distance. Set any
              connection to Not set to keep its straight preview.
            </p>
            <ol
              className="max-h-56 space-y-2 overflow-y-auto pr-1"
              aria-label="Overview route connections"
            >
              {route.segments.map((segment, index) => (
                <li
                  className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,0.8fr)] items-center gap-2 rounded-lg border p-2"
                  key={`${segment.from.id}:${segment.to.id}`}
                >
                  <div className="min-w-0 text-xs">
                    <span className="block truncate font-medium">
                      {index + 1}. {segment.from.entries[0].title} → {segment.to.entries[0].title}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {segment.calculatedLeg
                        ? segment.calculatedLeg.geometry.source === "google"
                          ? "Calculated route"
                          : "Straight fallback"
                        : "Straight preview"}
                    </span>
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
                      aria-label={`Transport from ${segment.from.entries[0].title} to ${segment.to.entries[0].title}`}
                      className="h-10"
                    >
                      <SelectValue placeholder="Select transport" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={notSetValue}>Not set · straight line</SelectItem>
                      {overviewRouteModes.map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {overviewRouteModeLabels[mode]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </li>
              ))}
            </ol>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              {hasConfiguration ? (
                <Button
                  disabled={route.pending}
                  onClick={route.reset}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Reset defaults
                </Button>
              ) : null}
              <Button
                disabled={
                  route.pending || !hasPendingCalculation || Boolean(route.configurationError)
                }
                onClick={() => void route.calculate()}
                size="sm"
                type="button"
              >
                {route.pending
                  ? "Calculating…"
                  : hasPendingCalculation
                    ? "Calculate overview"
                    : "Routes current"}
              </Button>
            </div>
          </div>
        ) : null}
        {route.configurationError || route.error ? (
          <p
            className="mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive"
            role="alert"
          >
            {route.configurationError ?? route.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
