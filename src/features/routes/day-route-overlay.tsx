"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { Pencil, Plus, Route, X } from "lucide-react";

import { PullUpPanelHandle } from "@/components/ui/pull-up-panel";
import { transportModeLabels } from "@/features/itinerary/types";

import { DayRouteEditor } from "./day-route-editor";
import {
  DayRouteStatusBadge,
  formatRouteDistance,
  formatRouteDuration,
  SelectedPlaceSlot,
} from "./day-route-panel-ui";
import { RouteIconButton } from "./route-icon-button";
import { RouteLegDetails } from "./route-leg-details";
import type { DayRouteUi } from "./use-day-route";

function DayRouteSummary({
  onClose,
  route,
  selectedPlace,
}: {
  onClose: () => void;
  route: DayRouteUi;
  selectedPlace?: React.ReactNode;
}) {
  const { locale, t } = useI18n();
  const calculation = route.plan?.calculation;
  const stops = route.plan?.stops.length ?? 0;
  const modes = [
    ...new Set(route.plan?.legs.map(({ mode }) => t(transportModeLabels[mode])) ?? []),
  ];
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
  const itemTitles = new Map(route.stopItems.map((item) => [item.id, item.title]));
  const orderedStops = route.plan?.stops
    .slice()
    .sort((left, right) => left.position - right.position);
  const legDetails =
    calculation?.calculatedLegs.map((leg) => ({
      ...leg,
      fromLabel: itemTitles.get(orderedStops?.[leg.position - 1]?.item_id ?? ""),
      toLabel: itemTitles.get(orderedStops?.[leg.position]?.item_id ?? ""),
    })) ?? [];

  return (
    <section className="map-bottom-panel day-route-summary mobile-pull-up-panel absolute bottom-3 left-3 right-3 z-20 flex max-h-[62dvh] flex-col overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <PullUpPanelHandle className="sm:hidden" onClose={onClose} />
      <SelectedPlaceSlot>{selectedPlace}</SelectedPlaceSlot>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-primary" />
            <p className="truncate text-sm font-semibold">
              {route.activeDay ? (
                <T message={"Day {day}"} values={{ day: route.activeDay.day_number }} />
              ) : null}{" "}
              <T message={" · Route A "} />
            </p>
            <DayRouteStatusBadge route={route} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {stops} <T message={" stops "} />
            {calculation ? ` · ${formatRouteDistance(calculation.total_distance_meters)}` : ""}
            {calculation?.total_duration_seconds !== null &&
            calculation?.total_duration_seconds !== undefined
              ? ` · ${formatRouteDuration(calculation.total_duration_seconds, locale)}`
              : calculation
                ? ` · ${t("Duration incomplete")}`
                : ` · ${t("Not calculated")}`}
            {modes.length ? ` · ${modes.join(", ")}` : ""}
          </p>
        </div>
        <RouteIconButton
          label="Edit route"
          onClick={route.openEdit}
          title="Edit route"
          variant="secondary"
        >
          <Pencil className="size-4" />
        </RouteIconButton>
        <RouteIconButton label="Close route panel" onClick={onClose} title="Close panel">
          <X className="size-4" />
        </RouteIconButton>
      </div>
      {missingDurations?.length ? (
        <p className="px-3 text-[11px] text-muted-foreground">
          <T message={" Duration unknown for "} />
          {missingDurations.map((position) => `leg ${position}`).join(", ")}.
        </p>
      ) : null}
      {transitEstimate ? (
        <p className="px-3 text-[11px] text-muted-foreground">
          <T
            message={
              " Transit is an approximate current-service estimate, not an itinerary-time calculation. "
            }
          />
        </p>
      ) : null}
      {warnings.length ? (
        <details className="px-3 text-[11px] text-amber-900">
          <summary className="cursor-pointer">
            {warnings.length} <T message={" route warning(s)"} />
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <RouteLegDetails legs={legDetails} />
      {route.error ? (
        <p
          className="m-3 mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive"
          role="alert"
        >
          <Localized value={route.error} />
        </p>
      ) : null}
    </section>
  );
}

export function DayRouteOverlay({
  onClose,
  route,
  selectedPlace,
}: {
  onClose: () => void;
  route: DayRouteUi;
  selectedPlace?: React.ReactNode;
}) {
  if (!route.activeDay)
    return (
      <section className="map-bottom-panel day-route-summary mobile-pull-up-panel absolute bottom-3 left-3 right-3 z-20 overscroll-none rounded-xl border bg-background/95 px-4 pb-4 text-center shadow-lg backdrop-blur">
        <PullUpPanelHandle className="sm:hidden" onClose={onClose} />
        <RouteIconButton
          className="absolute right-2 top-2"
          label="Close route panel"
          onClick={onClose}
          title="Close panel"
        >
          <X className="size-4" />
        </RouteIconButton>
        <p className="text-sm font-semibold">
          <T message={"Select a day"} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          <T message={" Choose a matrix day to view its eligible places. "} />
        </p>
      </section>
    );
  if (route.editing)
    return (
      <DayRouteEditor onBack={route.cancelEditing} route={route} selectedPlace={selectedPlace} />
    );
  if (route.plan)
    return <DayRouteSummary onClose={onClose} route={route} selectedPlace={selectedPlace} />;
  return (
    <section className="map-bottom-panel day-route-summary mobile-pull-up-panel absolute bottom-3 left-3 right-3 z-20 overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <PullUpPanelHandle className="sm:hidden" onClose={onClose} />
      <SelectedPlaceSlot>{selectedPlace}</SelectedPlaceSlot>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            <T message={"Day {day}"} values={{ day: route.activeDay.day_number }} />{" "}
            <T message={" · No day route"} />
          </p>
          <p className="text-xs text-muted-foreground">
            <T
              message={
                " Eligible saved places are shown in gray. Nothing is routed until you save. "
              }
            />
          </p>
        </div>
        <RouteIconButton
          label="Create route"
          onClick={route.openCreate}
          title="Create route"
          variant="primary"
        >
          <Plus className="size-4" />
        </RouteIconButton>
        <RouteIconButton label="Close route panel" onClick={onClose} title="Close panel">
          <X className="size-4" />
        </RouteIconButton>
      </div>
    </section>
  );
}
