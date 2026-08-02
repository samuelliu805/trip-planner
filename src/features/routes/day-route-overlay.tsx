"use client";

import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Footprints,
  MapPin,
  Route,
  Trash2,
  Utensils,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { transportModeLabels, type ItineraryItem } from "@/features/itinerary/types";

import { routeLegModes, type RouteLegMode } from "./types";
import type { DayRouteUi } from "./use-day-route";

const statusLabels = {
  current: "Current",
  needs_edit: "Needs editing",
  stale: "Stale",
  uncalculated: "Not calculated",
  updating: "Updating",
} as const;

const formatDistance = (meters: number) =>
  meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${Math.round(meters)} m`;

const formatDuration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes} min`;
};

const StopIcon = ({ item }: { item?: ItineraryItem }) => {
  if (item?.type === "hotel") return <BedDouble className="size-4" />;
  if (item?.type === "meal") return <Utensils className="size-4" />;
  return <MapPin className="size-4" />;
};

function Status({ route }: { route: DayRouteUi }) {
  if (!route.status) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${route.status === "current" ? "bg-primary/15 text-primary" : "bg-amber-100 text-amber-900"}`}
    >
      {statusLabels[route.status]}
    </span>
  );
}

const SelectedPlaceSlot = ({ children }: { children?: React.ReactNode }) =>
  children ? <div className="border-b p-3">{children}</div> : null;

function Editor({ route, selectedPlace }: { route: DayRouteUi; selectedPlace?: React.ReactNode }) {
  const draft = route.draft!;
  const itemsById = new Map(route.activeDay?.items.map((item) => [item.id, item]) ?? []);
  const planned = new Set(draft.itemIds);
  const unplanned = route.eligibleItems.filter(({ id }) => !planned.has(id));
  const hotelCount = route.eligibleItems.filter(({ type }) => type === "hotel").length;
  return (
    <section
      aria-label="Edit Route A"
      className="day-route-editor absolute bottom-3 right-3 top-14 z-30 flex w-[min(360px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border bg-background/97 shadow-xl backdrop-blur"
    >
      <header className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Day {route.activeDay?.day_number} · Route A</p>
            <p className="text-xs text-muted-foreground">Manual order is used.</p>
          </div>
          <Status route={route} />
        </div>
      </header>
      <SelectedPlaceSlot>{selectedPlace}</SelectedPlaceSlot>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {draft.itemIds.length ? (
          <ol className="space-y-2" aria-label="Planned stops">
            {draft.itemIds.map((itemId, index) => {
              const item = itemsById.get(itemId);
              const time = item?.start_time?.slice(0, 5);
              return (
                <li key={`${itemId}:${index}`}>
                  <div className="flex min-h-11 items-center gap-2 rounded-lg border bg-background px-2 py-1.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span className="text-muted-foreground">
                      <StopIcon item={item} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">
                        {item?.title ?? "Deleted item"}
                      </span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {time ? `${time} · ` : ""}
                        {item?.place ? item.place.displayName : "Saved place missing"}
                      </span>
                    </span>
                    <button
                      aria-label={`Move stop ${index + 1} up`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"
                      disabled={index === 0 || route.pending}
                      onClick={() => route.moveStop(index, -1)}
                      type="button"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      aria-label={`Move stop ${index + 1} down`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"
                      disabled={index === draft.itemIds.length - 1 || route.pending}
                      onClick={() => route.moveStop(index, 1)}
                      type="button"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <button
                      aria-label={`Remove stop ${index + 1}`}
                      className="flex size-11 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-30"
                      disabled={route.pending}
                      onClick={() => route.removeStop(index)}
                      type="button"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {index < draft.legModes.length ? (
                    <div className="ml-4 flex min-h-12 items-center gap-2 border-l-2 border-dashed border-primary/30 pl-4">
                      <Footprints className="size-4 shrink-0 text-primary" />
                      <Select
                        disabled={route.pending}
                        onValueChange={(value) => route.setLegMode(index, value as RouteLegMode)}
                        value={draft.legModes[index]}
                      >
                        <SelectTrigger
                          aria-label={`Travel mode for leg ${index + 1}`}
                          className="h-10"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {routeLegModes.map((mode) => (
                            <SelectItem key={mode} value={mode}>
                              {transportModeLabels[mode]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
            Add stops from Unplanned places or select a gray Pin on the map.
          </div>
        )}

        {hotelCount === 1 ? (
          <Button
            className="mt-3 w-full"
            disabled={route.pending}
            onClick={route.useHotelRoundTrip}
            size="sm"
            type="button"
            variant="outline"
          >
            <BedDouble className="size-4" />
            Use hotel as start &amp; end
          </Button>
        ) : null}

        <details className="mt-3 rounded-lg border" open={!draft.itemIds.length}>
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-xs font-semibold">
            Unplanned places ({unplanned.length})
          </summary>
          <div className="border-t p-2">
            {unplanned.length ? (
              <ul className="space-y-1">
                {unplanned.map((item) => (
                  <li className="flex min-h-11 items-center gap-2" key={item.id}>
                    <span className="text-muted-foreground">
                      <StopIcon item={item} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs">{item.title}</span>
                    <Button
                      disabled={route.pending}
                      onClick={() => route.addStop(item.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-2 text-xs text-muted-foreground">All eligible places are planned.</p>
            )}
          </div>
        </details>

        {route.error ? (
          <p
            className="mt-3 rounded-md bg-destructive/10 p-2 text-xs text-destructive"
            role="alert"
          >
            {route.error}
          </p>
        ) : null}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t p-3">
        {route.plan ? (
          <Button
            disabled={route.pending}
            onClick={() => {
              if (window.confirm("Clear this saved day route and its calculation?"))
                void route.clearRoute();
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear route
          </Button>
        ) : null}
        <Button
          disabled={route.pending}
          onClick={route.cancelEditing}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          disabled={draft.itemIds.length < 2 || route.pending}
          onClick={() => void route.saveAndCalculate()}
          size="sm"
          type="button"
        >
          {route.pending ? "Saving…" : "Save & calculate"}
        </Button>
      </footer>
    </section>
  );
}

function Summary({ route, selectedPlace }: { route: DayRouteUi; selectedPlace?: React.ReactNode }) {
  const calculation = route.plan?.calculation;
  const stops = route.plan?.stops.length ?? 0;
  const modes = [...new Set(route.plan?.legs.map(({ mode }) => transportModeLabels[mode]) ?? [])];
  const missingDurations = calculation?.calculatedLegs
    .filter(({ durationSeconds }) => durationSeconds === null)
    .map(({ position }) => position);
  const warnings = [
    ...new Set(
      calculation?.calculatedLegs.flatMap(({ warnings: legWarnings }) =>
        legWarnings.map(({ message }) => message),
      ) ?? [],
    ),
  ];
  const transitEstimate = calculation?.calculatedLegs.some(
    ({ estimateKind }) => estimateKind === "transit_current_service",
  );

  return (
    <section className="day-route-summary absolute bottom-3 left-3 right-3 z-20 overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <SelectedPlaceSlot>{selectedPlace}</SelectedPlaceSlot>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-primary" />
            <p className="truncate text-sm font-semibold">
              Day {route.activeDay?.day_number} · Route A
            </p>
            <Status route={route} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stops} stops
            {calculation ? ` · ${formatDistance(calculation.total_distance_meters)}` : ""}
            {calculation?.total_duration_seconds !== null &&
            calculation?.total_duration_seconds !== undefined
              ? ` · ${formatDuration(calculation.total_duration_seconds)}`
              : calculation
                ? " · Duration incomplete"
                : " · Not calculated"}
            {modes.length ? ` · ${modes.join(", ")}` : ""}
          </p>
        </div>
        <Button onClick={route.requestFit} size="sm" type="button" variant="outline">
          View route
        </Button>
        {!selectedPlace ? (
          <Button onClick={route.openEdit} size="sm" type="button">
            Edit route
          </Button>
        ) : null}
      </div>
      {missingDurations?.length ? (
        <p className="px-3 text-[11px] text-muted-foreground">
          Duration unknown for {missingDurations.map((position) => `leg ${position}`).join(", ")}.
        </p>
      ) : null}
      {transitEstimate ? (
        <p className="px-3 text-[11px] text-muted-foreground">
          Transit is an approximate current-service estimate, not an itinerary-time calculation.
        </p>
      ) : null}
      {warnings.length ? (
        <details className="px-3 text-[11px] text-amber-900">
          <summary className="cursor-pointer">{warnings.length} route warning(s)</summary>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {route.error ? (
        <p
          className="m-3 mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive"
          role="alert"
        >
          {route.error}
        </p>
      ) : null}
    </section>
  );
}

export function DayRouteOverlay({
  route,
  selectedPlace,
}: {
  route: DayRouteUi;
  selectedPlace?: React.ReactNode;
}) {
  if (!route.activeDay)
    return (
      <section className="day-route-summary absolute bottom-3 left-3 right-3 z-20 rounded-xl border bg-background/95 p-4 text-center shadow-lg backdrop-blur">
        <p className="text-sm font-semibold">Select a day</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose a matrix day to view its eligible places.
        </p>
      </section>
    );
  if (route.editing) return <Editor route={route} selectedPlace={selectedPlace} />;
  if (route.plan) return <Summary route={route} selectedPlace={selectedPlace} />;
  return (
    <section className="day-route-summary absolute bottom-3 left-3 right-3 z-20 overflow-hidden rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <SelectedPlaceSlot>{selectedPlace}</SelectedPlaceSlot>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <div className="mr-auto">
          <p className="text-sm font-semibold">Day {route.activeDay.day_number} · No day route</p>
          <p className="text-xs text-muted-foreground">
            Eligible saved places are shown in gray. Nothing is routed until you save.
          </p>
        </div>
        <Button onClick={route.openCreate} size="sm" type="button">
          Create route
        </Button>
      </div>
    </section>
  );
}
