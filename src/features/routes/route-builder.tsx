"use client";

import { ArrowDown, ArrowUp, ChevronDown, MapPinned } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import { plannerQueryKey } from "@/features/itinerary/queries";
import { useQueryClient } from "@tanstack/react-query";

import { calculateDayRoute, configureDayRoute } from "./actions";
import { eligibleRouteItems } from "./types";
import type { RouteTravelMode } from "./types";

const modeLabels: Record<RouteTravelMode, string> = {
  bicycle: "Bicycle",
  drive: "Drive",
  transit: "Transit",
  walk: "Walk",
};

function durationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

export function RouteBuilder({
  compact = false,
  initialDayId,
  onViewRoute,
  tripId,
  workspace,
}: {
  compact?: boolean;
  initialDayId?: string;
  onViewRoute: (dayId: string) => void;
  tripId: string;
  workspace: PlannerWorkspace;
}) {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(compact);
  const [dayId, setDayId] = useState(initialDayId ?? workspace.days[0]?.id ?? "");
  const day = workspace.days.find((candidate) => candidate.id === dayId) ?? workspace.days[0];
  const eligible = useMemo(() => (day ? eligibleRouteItems(day) : []), [day]);
  const saved = useMemo(
    () =>
      day?.items
        .filter((item) => item.route_stop_order !== null && item.place)
        .sort((a, b) => (a.route_stop_order ?? 0) - (b.route_stop_order ?? 0))
        .map(({ id }) => id) ?? [],
    [day],
  );
  const [orderedIds, setOrderedIds] = useState<string[]>(
    saved.length ? saved : eligible.map(({ id }) => id),
  );
  const [mode, setMode] = useState<RouteTravelMode>(day?.route_travel_mode ?? "walk");
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  if (!day) return null;
  const changed = mode !== day.route_travel_mode || orderedIds.join("|") !== saved.join("|");
  const stale = Boolean(day.route && (day.route_is_stale || changed));
  const calculate = () =>
    startTransition(async () => {
      setMessage(undefined);
      const configured = await configureDayRoute({
        dayId: day.id,
        itemIds: orderedIds,
        travelMode: mode,
      });
      if (configured.error) return setMessage(configured.error);
      const result = await calculateDayRoute(day.id);
      if (result.error || !result.data)
        return setMessage(result.error ?? "The route could not be calculated.");
      await queryClient.invalidateQueries({ queryKey: plannerQueryKey(tripId) });
      setMessage(result.data.cacheHit ? "Current cached route loaded." : "Route calculated.");
      onViewRoute(day.id);
    });
  return (
    <aside
      className="route-builder w-full rounded-xl border bg-background/95 shadow-lg backdrop-blur"
      aria-label="Route A builder"
    >
      <button
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm font-semibold"
        onClick={() => setCollapsed((value) => !value)}
        type="button"
      >
        <span className="flex items-center gap-2 whitespace-nowrap">
          <MapPinned className="size-4 text-emerald-700" />
          Route A
        </span>
        <ChevronDown className={`size-4 transition-transform ${collapsed ? "" : "rotate-180"}`} />
      </button>
      {!collapsed ? (
        <div className="space-y-3 border-t p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium">
              Day
              <select
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-2"
                value={day.id}
                onChange={(event) => {
                  const next = workspace.days.find(({ id }) => id === event.target.value);
                  if (!next) return;
                  const nextEligible = eligibleRouteItems(next);
                  const nextSaved = next.items
                    .filter((item) => item.route_stop_order !== null && item.place)
                    .sort((a, b) => (a.route_stop_order ?? 0) - (b.route_stop_order ?? 0))
                    .map(({ id }) => id);
                  setDayId(next.id);
                  setMode(next.route_travel_mode);
                  setOrderedIds(nextSaved.length ? nextSaved : nextEligible.map(({ id }) => id));
                }}
              >
                {workspace.days.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    Day {candidate.day_number}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Travel mode
              <select
                className="mt-1 min-h-11 w-full rounded-md border bg-background px-2"
                value={mode}
                onChange={(event) => setMode(event.target.value as RouteTravelMode)}
              >
                {Object.entries(modeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="max-h-52 space-y-1 overflow-y-auto" aria-label="Ordered route stops">
            {eligible.map((item) => {
              const index = orderedIds.indexOf(item.id);
              const included = index >= 0;
              return (
                <div
                  className="flex min-h-11 items-center gap-2 rounded-md border px-2"
                  key={item.id}
                >
                  <input
                    aria-label={`Include ${item.title}`}
                    checked={included}
                    className="size-5"
                    onChange={() =>
                      setOrderedIds((ids) =>
                        included ? ids.filter((id) => id !== item.id) : [...ids, item.id],
                      )
                    }
                    type="checkbox"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {included ? `${index + 1}. ` : ""}
                    {item.title}
                  </span>
                  <Button
                    aria-label={`Move ${item.title} up`}
                    className="size-11 p-0"
                    disabled={!included || index === 0}
                    onClick={() =>
                      setOrderedIds((ids) => {
                        const next = [...ids];
                        [next[index - 1], next[index]] = [next[index], next[index - 1]];
                        return next;
                      })
                    }
                    variant="ghost"
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    aria-label={`Move ${item.title} down`}
                    className="size-11 p-0"
                    disabled={!included || index === orderedIds.length - 1}
                    onClick={() =>
                      setOrderedIds((ids) => {
                        const next = [...ids];
                        [next[index + 1], next[index]] = [next[index], next[index + 1]];
                        return next;
                      })
                    }
                    variant="ghost"
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </div>
              );
            })}
          </div>
          {orderedIds.length < 2 ? (
            <p className="text-xs text-amber-700">
              Select at least two saved places to calculate a route.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-2 text-xs">
            <span>{stale ? "Stale route" : day.route ? "Current route" : "Not calculated"}</span>
            <span>{orderedIds.length} stops</span>
          </div>
          {day.route ? (
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{(day.route.distance_meters / 1000).toFixed(1)} km</span>
              <span>{durationLabel(day.route.duration_seconds)}</span>
            </div>
          ) : null}
          {message ? (
            <p className="text-xs" role="status">
              {message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button
              className="min-h-11 flex-1 whitespace-nowrap"
              disabled={pending || orderedIds.length < 2}
              onClick={calculate}
            >
              {pending ? "Calculating…" : stale || !day.route ? "Calculate route" : "Route current"}
            </Button>
            {day.route ? (
              <Button
                className="min-h-11 whitespace-nowrap"
                onClick={() => onViewRoute(day.id)}
                variant="outline"
              >
                View route
              </Button>
            ) : null}
          </div>
          {mode === "walk" || mode === "bicycle" ? (
            <p className="text-[11px] leading-4 text-muted-foreground">
              Walking and cycling routes may not reflect all real-world conditions. Follow posted
              signs and use caution.
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
