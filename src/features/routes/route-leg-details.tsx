"use client";

import { ChevronDown, Clock3, MapPinned, Route } from "lucide-react";
import { useState } from "react";

import { formatRouteDistance, formatRouteDuration } from "./day-route-panel-ui";
import { routeLegExplanation, type RouteLegDetail } from "./route-leg-presentation";

export type { RouteLegDetail } from "./route-leg-presentation";

function RouteLegList({ legs }: { legs: RouteLegDetail[] }) {
  return (
    <ol aria-label="Route leg details" className="divide-y">
      {legs
        .slice()
        .sort((left, right) => left.position - right.position)
        .map((leg) => {
          const duration =
            leg.durationSeconds === null || leg.durationSeconds === undefined
              ? "Time unavailable"
              : formatRouteDuration(leg.durationSeconds);
          const distance =
            leg.distanceMeters === null || leg.distanceMeters === undefined
              ? null
              : formatRouteDistance(leg.distanceMeters);
          return (
            <li
              className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2"
              key={`${leg.position}:${leg.fromLabel ?? "start"}:${leg.toLabel ?? "end"}`}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                {leg.position}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium">
                  {leg.fromLabel && leg.toLabel
                    ? `${leg.fromLabel} → ${leg.toLabel}`
                    : `Leg ${leg.position}`}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {routeLegExplanation(leg)}
                </span>
              </span>
              <span className="text-right text-[10px] text-muted-foreground">
                <span className="block whitespace-nowrap font-medium text-foreground">
                  {duration}
                </span>
                {distance ? <span className="block whitespace-nowrap">{distance}</span> : null}
              </span>
            </li>
          );
        })}
    </ol>
  );
}

export function RouteLegDetails({
  defaultOpen = false,
  legs,
}: {
  defaultOpen?: boolean;
  legs: RouteLegDetail[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!legs.length) return null;
  const knownDuration = legs.every(
    ({ durationSeconds }) => durationSeconds !== null && durationSeconds !== undefined,
  )
    ? legs.reduce((total, leg) => total + (leg.durationSeconds ?? 0), 0)
    : null;
  const knownDistance = legs.every(
    ({ distanceMeters }) => distanceMeters !== null && distanceMeters !== undefined,
  )
    ? legs.reduce((total, leg) => total + (leg.distanceMeters ?? 0), 0)
    : null;

  return (
    <section className="border-t">
      <button
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-xs font-semibold hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Route aria-hidden="true" className="size-3.5 text-primary" />
        <span>
          {legs.length} {legs.length === 1 ? "leg" : "legs"}
        </span>
        {knownDuration !== null ? (
          <span className="flex items-center gap-1 font-normal text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-3" />
            {formatRouteDuration(knownDuration)}
          </span>
        ) : null}
        {knownDistance !== null ? (
          <span className="flex items-center gap-1 font-normal text-muted-foreground">
            <MapPinned aria-hidden="true" className="size-3" />
            {formatRouteDistance(knownDistance)}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className={`ml-auto size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div className="max-h-44 overflow-y-auto overscroll-contain border-t">
          <RouteLegList legs={legs} />
        </div>
      ) : null}
    </section>
  );
}
