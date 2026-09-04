"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { LoaderCircle, RotateCcw, Route, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatRouteDuration } from "./day-route-panel-ui";
import { overviewRouteModeLabels } from "./overview-transport";
import { RouteIconButton } from "./route-icon-button";
import { RouteLegDetails } from "./route-leg-details";
import { overviewRouteModes, type OverviewRouteMode } from "./types";
import type { OverviewRouteUi } from "./use-overview-route";

const notSetValue = "not_set";

const formatDistance = (meters: number) =>
  meters >= 1_000 ? `${(meters / 1_000).toFixed(1)} km` : `${Math.round(meters)} m`;

export function OverviewRouteOverlay({
  onClose,
  route,
  selectedPlace,
}: {
  onClose: () => void;
  route: OverviewRouteUi;
  selectedPlace?: React.ReactNode;
}) {
  const { locale, t } = useI18n();
  if (!route.segments.length)
    return selectedPlace ? (
      <section className="map-bottom-panel overview-route-panel absolute bottom-3 left-3 right-3 z-20 overscroll-none rounded-xl border bg-background/95 p-3 pr-12 shadow-lg backdrop-blur">
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
    <section className="map-bottom-panel overview-route-panel absolute bottom-3 left-3 right-3 z-20 flex max-h-[62dvh] flex-col overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-lg backdrop-blur min-[900px]:max-h-[calc(100%-4.5rem)]">
      {selectedPlace ? <div className="shrink-0 border-b px-3 py-2">{selectedPlace}</div> : null}
      <div className="flex min-h-0 flex-1 flex-col px-3 py-2">
        <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Route className="size-4 shrink-0 text-primary" />
            <p className="min-w-0 truncate text-base font-semibold">
              <T message={"Overview route"} />
            </p>
          </div>
          {route.editing ? (
            <RouteIconButton
              className="col-start-2 row-start-1"
              label="Finish route setup"
              onClick={() => route.setEditing(false)}
              title="Finish route setup"
            >
              <X className="size-4" />
            </RouteIconButton>
          ) : (
            <Button
              className="col-start-2 row-start-1"
              onClick={() => route.setEditing(true)}
              size="sm"
              type="button"
              variant={hasPendingCalculation ? "default" : "outline"}
            >
              <Localized value={hasPendingCalculation ? "Set up route" : "Route details"} />
            </Button>
          )}
          {!route.editing ? (
            <RouteIconButton
              className="col-start-3 row-start-1"
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
            <ol
              aria-label="Overview route connections"
              data-i18n-aria-label={"Overview route connections"}
              className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1 sm:max-h-56"
            >
              {route.segments.map((segment, index) => {
                const leg = segment.calculatedLeg;
                const dayLabel =
                  segment.from.firstDayLabel === segment.to.firstDayLabel
                    ? segment.from.firstDayLabel
                    : `${segment.from.firstDayLabel} → ${segment.to.firstDayLabel}`;
                const legMeta = leg
                  ? [
                      formatDistance(leg.distanceMeters),
                      leg.durationSeconds === null
                        ? t("Duration unavailable")
                        : `${leg.estimateKind === "transit_current_service" ? t("Approx. ") : ""}${formatRouteDuration(leg.durationSeconds, locale)}`,
                    ]
                  : [];
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
                        {[dayLabel, ...legMeta].join(" · ")}
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
                        aria-label={t("Travel from {from} to {to}", {
                          from: segment.from.entries[0].title,
                          to: segment.to.entries[0].title,
                        })}
                        className="h-10"
                      >
                        <SelectValue placeholder={t("Select travel mode")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={notSetValue}>
                          <T message={"Not set · preview line"} />
                        </SelectItem>
                        {overviewRouteModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>
                            <Localized value={overviewRouteModeLabels[mode]} />
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
                <Localized
                  value={
                    route.pending
                      ? "Calculating…"
                      : hasPendingCalculation
                        ? "Calculate route"
                        : "Routes current"
                  }
                />
              </Button>
            </div>
          </div>
        ) : null}
        {!route.editing ? <RouteLegDetails legs={legDetails} /> : null}
        <AutoDismissAlert
          className="mt-2 rounded-md text-xs shadow-none"
          role="alert"
          tone="destructive"
          value={route.error}
        >
          {route.error ? <Localized value={route.error} /> : null}
        </AutoDismissAlert>
      </div>
    </section>
  );
}
