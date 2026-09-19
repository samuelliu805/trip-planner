"use client";

import { Localized, T } from "@/features/i18n/i18n-provider";
import { LoaderCircle, Pencil, Plus, RefreshCw, Route, X } from "lucide-react";

import { AutoDismissAlert } from "@/components/ui/auto-dismiss-alert";
import { DayRouteEditor } from "./day-route-editor";
import { SelectedPlaceSlot } from "./day-route-panel-ui";
import { RouteIconButton } from "./route-icon-button";
import { RouteLegDetails } from "./route-leg-details";
import { canonicalRouteLegMode } from "./types";
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
  const calculation = route.plan?.calculation;
  const itemTitles = new Map(route.stopItems.map((item) => [item.id, item.title]));
  const orderedStops = route.plan?.stops
    .slice()
    .sort((left, right) => left.position - right.position);
  const savedItemIds = orderedStops?.map(({ item_id }) => item_id) ?? [];
  const calculatedByConnection = new Map(
    (calculation?.calculatedLegs ?? []).flatMap((leg) => {
      const from = savedItemIds[leg.position - 1];
      const to = savedItemIds[leg.position];
      return from && to
        ? [[`${from}\u0000${to}\u0000${canonicalRouteLegMode(leg.mode)}`, leg] as const]
        : [];
    }),
  );
  const displayed = route.displayDraft;
  const legDetails =
    displayed?.itemIds.slice(0, -1).flatMap((from, index) => {
      const to = displayed.itemIds[index + 1];
      const mode = displayed.legModes[index];
      const leg = calculatedByConnection.get(`${from}\u0000${to}\u0000${mode}`);
      return leg
        ? [
            {
              ...leg,
              fromLabel: itemTitles.get(from),
              position: index + 1,
              toLabel: itemTitles.get(to),
            },
          ]
        : [];
    }) ?? [];

  return (
    <section className="map-bottom-panel day-route-summary absolute bottom-3 left-3 right-3 z-20 flex max-h-[62dvh] flex-col overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <SelectedPlaceSlot>{selectedPlace}</SelectedPlaceSlot>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2">
        <div className="mr-auto min-w-0">
          <div className="flex items-center gap-2">
            <Route className="size-4 text-primary" />
            <p className="truncate text-sm font-semibold">
              {route.activeDay ? (
                <T message={"Day {day}"} values={{ day: route.activeDay.day_number }} />
              ) : null}
            </p>
          </div>
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
      {route.status && route.status !== "current" ? (
        <button
          className="mx-3 mb-2 flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
          data-route-update=""
          disabled={route.pending}
          onClick={() => void route.recalculate()}
          type="button"
        >
          {route.pending ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" className="size-4" />
          )}
          <Localized value={route.pending ? "Updating route…" : "Route changed · Update route"} />
        </button>
      ) : null}
      <RouteLegDetails legs={legDetails} />
      <AutoDismissAlert
        className="m-3 mt-2 rounded-md text-xs shadow-none"
        role="alert"
        tone="destructive"
        value={route.error}
      >
        {route.error ? <Localized value={route.error} /> : null}
      </AutoDismissAlert>
      {route.conflict ? (
        <button
          className="mx-3 mb-3 min-h-11 rounded-md border border-destructive px-3 text-sm font-medium text-destructive"
          onClick={() => void route.reloadLatest()}
          type="button"
        >
          <T message="Reload latest" />
        </button>
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
      <section className="map-bottom-panel day-route-summary absolute bottom-3 left-3 right-3 z-20 overscroll-none rounded-xl border bg-background/95 p-4 text-center shadow-lg backdrop-blur">
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
    <section className="map-bottom-panel day-route-summary absolute bottom-3 left-3 right-3 z-20 overflow-hidden overscroll-none rounded-xl border bg-background/95 shadow-lg backdrop-blur">
      <SelectedPlaceSlot>{selectedPlace}</SelectedPlaceSlot>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            <T message={"Day {day}"} values={{ day: route.activeDay.day_number }} />{" "}
            <T message={" · No day route"} />
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
