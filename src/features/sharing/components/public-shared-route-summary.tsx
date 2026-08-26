import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { MapPinOff, MapPinned, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import { transportModeLabels } from "@/features/itinerary/types";

import { formatDistance, formatDuration } from "../presentation";
import type { PublicItineraryItem, PublicSavedRoute } from "../types";
import { PublicRouteLegDetails } from "./public-route-summary";

export function PublicSharedRouteSummary({
  canExplore,
  candidates,
  onExplore,
  omittedActivityCount,
  route,
  unmappedActivityCount,
}: {
  canExplore: boolean;
  candidates: PublicItineraryItem[];
  onExplore: () => void;
  omittedActivityCount: number;
  route?: PublicSavedRoute;
  unmappedActivityCount: number;
}) {
  const { locale, t } = useI18n();
  const modes = Array.from(new Set(route?.legs.map(({ mode }) => mode) ?? []));
  const stops = route?.stops ?? candidates;

  return (
    <>
      {route ? (
        <p className="flex min-h-9 items-center gap-2 border px-2.5 text-xs text-muted-foreground">
          <MapPinned aria-hidden="true" className="size-4 shrink-0" />
          {modes.length
            ? modes.map((mode) => t(transportModeLabels[mode])).join(" / ")
            : t("Shared route")}
          {route.totalDistanceMeters != null
            ? ` · ${formatDistance(route.totalDistanceMeters)}`
            : ""}
          {route.totalDurationSeconds != null
            ? ` · ${formatDuration(route.totalDurationSeconds, locale)}`
            : ""}
        </p>
      ) : null}
      <ol className="relative space-y-1.5 before:absolute before:bottom-3 before:left-3.5 before:top-3 before:w-px before:bg-border">
        {stops.map((stop, index) => (
          <li
            className="relative flex min-h-7 items-center gap-2 text-xs"
            key={`${stop.ref}:${index}`}
          >
            <span className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{stop.title}</span>
            {index === 0 || index === stops.length - 1 ? (
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                <Localized value={index === 0 ? "Start" : "End"} />
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      {route ? (
        <PublicRouteLegDetails labels={route.stops.map(({ title }) => title)} legs={route.legs} />
      ) : null}
      {omittedActivityCount ? (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <MapPinOff aria-hidden="true" className="size-3.5 shrink-0" />
          {t("{count} mapped activity/activity(s) added in Explore route", {
            count: omittedActivityCount,
          })}
        </p>
      ) : null}
      {unmappedActivityCount ? (
        <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <MapPinOff aria-hidden="true" className="size-3.5 shrink-0" />
          {t("{count} activity/activity(s) have no map location", {
            count: unmappedActivityCount,
          })}
        </p>
      ) : null}
      {canExplore ? (
        <Button className="min-h-11 w-full" onClick={onExplore} type="button">
          <Route className="size-4" /> <T message={" Explore route "} />
        </Button>
      ) : null}
    </>
  );
}
