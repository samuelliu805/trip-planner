"use client";

import { useI18n } from "@/features/i18n/i18n-provider";
import { CarFront, ChevronDown, Clock3, Footprints, Route } from "lucide-react";
import { useState } from "react";

import { formatRouteDistance, formatRouteDuration } from "./day-route-panel-ui";
import { routeLegExplanation, type RouteLegDetail } from "./route-leg-presentation";

export type { RouteLegDetail } from "./route-leg-presentation";

function RouteLegList({ legs }: { legs: RouteLegDetail[] }) {
  const { locale, t } = useI18n();
  return (
    <ol
      aria-label="Route leg details"
      data-i18n-aria-label={"Route leg details"}
      className="divide-y"
    >
      {legs
        .slice()
        .sort((left, right) => left.position - right.position)
        .map((leg) => {
          const duration =
            leg.durationSeconds === null || leg.durationSeconds === undefined
              ? t("Time unavailable")
              : formatRouteDuration(leg.durationSeconds, locale);
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
                    : t("Leg {position}", { position: leg.position })}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {routeLegExplanation(leg, t)}
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
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  if (!legs.length) return null;
  const knownDuration = legs.every(
    ({ durationSeconds }) => durationSeconds !== null && durationSeconds !== undefined,
  )
    ? legs.reduce((total, leg) => total + (leg.durationSeconds ?? 0), 0)
    : null;
  const distanceFor = (modes: RouteLegDetail["mode"][]) => {
    const matching = legs.filter(({ mode }) => modes.includes(mode));
    if (!matching.length) return null;
    const known = matching.filter(
      ({ distanceMeters }) => distanceMeters !== null && distanceMeters !== undefined,
    );
    return known.length ? known.reduce((total, leg) => total + (leg.distanceMeters ?? 0), 0) : null;
  };
  const walkingDistance = distanceFor(["walk"]);
  const drivingDistance = distanceFor(["self_driving", "taxi", "rideshare", "motorcycle"]);

  return (
    <section className="border-t">
      <button
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-xs font-semibold hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Route aria-hidden="true" className="size-3.5 text-primary" />
        <span>{t("{count} leg(s)", { count: legs.length })}</span>
        {knownDuration !== null ? (
          <span className="flex items-center gap-1 font-normal text-muted-foreground">
            <Clock3 aria-hidden="true" className="size-3" />
            {formatRouteDuration(knownDuration, locale)}
          </span>
        ) : null}
        {walkingDistance !== null ? (
          <span className="flex items-center gap-1 font-normal text-muted-foreground">
            <Footprints aria-hidden="true" className="size-3" />
            <span className="sr-only">{t("Walking")}: </span>
            {formatRouteDistance(walkingDistance)}
          </span>
        ) : null}
        {drivingDistance !== null ? (
          <span className="flex items-center gap-1 font-normal text-muted-foreground">
            <CarFront aria-hidden="true" className="size-3" />
            <span className="sr-only">{t("Driving")}: </span>
            {formatRouteDistance(drivingDistance)}
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
