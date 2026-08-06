"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, useTransition } from "react";

import { PlannerMapProvider } from "@/features/maps/planner-map-provider";
import type { OverviewRouteMode, RouteLegMode } from "@/features/routes/types";

import { calculatePublicOverviewRoute, calculatePublicRoute } from "../actions";
import {
  buildPublicMarkers,
  buildPublicOverviewLines,
  buildPublicRouteLines,
  publicDayRoutePlan,
  publicOverviewDefaultModes,
  publicOverviewStops,
} from "../public-map-model";
import type { PublicItinerary, PublicRouteCalculation } from "../types";
import { PublicDayRoutePanel } from "./public-day-route-panel";
import { PublicOverviewRoutePanel } from "./public-overview-route-panel";
import { RouteScopePicker } from "./public-route-summary";

const PlannerMapCanvas = dynamic(
  () => import("@/features/maps/planner-map-canvas").then((module) => module.PlannerMapCanvas),
  { ssr: false },
);

export type PublicMapSelection = {
  dayRef?: string;
  itemRef?: string;
  scope?: "day" | "overview";
};

type PublicMapWorkspaceProps = {
  activeView: "overview" | "table" | "timeline";
  itinerary: PublicItinerary;
  onSelectionChange: (selection: PublicMapSelection) => void;
  selectedDayRef?: string;
  selectedItemRef?: string;
  selectionScope?: "day" | "overview";
  token: string;
};

export function PublicMapWorkspace(props: PublicMapWorkspaceProps) {
  return (
    <PlannerMapProvider>
      <PublicMapWorkspaceContent {...props} />
    </PlannerMapProvider>
  );
}

function PublicMapWorkspaceContent({
  activeView,
  itinerary,
  onSelectionChange,
  selectedDayRef,
  selectedItemRef,
  selectionScope,
  token,
}: PublicMapWorkspaceProps) {
  const defaultDayRef =
    selectedDayRef ?? itinerary.savedRoutes[0]?.dayRef ?? itinerary.days[0]?.ref ?? "";
  const [routeScopeOverride, setRouteScopeOverride] = useState<{
    scope: "day" | "overview";
    view: typeof activeView;
  }>();
  const [dayRef, setDayRef] = useState(defaultDayRef);
  const [exploringDayRef, setExploringDayRef] = useState<string>();
  const [dayMode, setDayMode] = useState<RouteLegMode>("self_driving");
  const [localStops, setLocalStops] = useState<string[]>([]);
  const [dayCalculation, setDayCalculation] = useState<PublicRouteCalculation>();
  const [overviewCalculation, setOverviewCalculation] = useState<PublicRouteCalculation>();
  const [overviewModes, setOverviewModes] = useState<OverviewRouteMode[]>(() =>
    publicOverviewDefaultModes(itinerary),
  );
  const [dayError, setDayError] = useState<string>();
  const [overviewError, setOverviewError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const markers = useMemo(() => buildPublicMarkers(itinerary), [itinerary]);
  const overviewStops = useMemo(() => publicOverviewStops(itinerary), [itinerary]);
  const straightOverviewLines = useMemo(() => buildPublicOverviewLines(itinerary), [itinerary]);
  const routeScope =
    selectionScope ??
    (selectedDayRef
      ? "day"
      : routeScopeOverride?.view === activeView
        ? routeScopeOverride.scope
        : activeView === "timeline"
          ? "day"
          : "overview");
  const dayPlan = publicDayRoutePlan(itinerary, selectedDayRef ?? dayRef);
  const day = dayPlan.day;
  const exploring = routeScope === "day" && exploringDayRef === day?.ref;
  const candidates = dayPlan.items;
  const routeSetupItems = [...candidates, ...dayPlan.unmappedActivities].sort((left, right) => {
    if (left.ref === dayPlan.startRef) return -1;
    if (right.ref === dayPlan.startRef) return 1;
    if (left.ref === dayPlan.endRef) return 1;
    if (right.ref === dayPlan.endRef) return -1;
    return left.sortOrder - right.sortOrder;
  });
  const savedRoute = itinerary.savedRoutes.find(({ dayRef: ref }) => ref === day?.ref);
  const savedStopRefs = new Set(savedRoute?.stops.map(({ ref }) => ref) ?? []);
  const omittedActivityCount = candidates.filter(
    (item) => item.type === "activity" && savedRoute && !savedStopRefs.has(item.ref),
  ).length;
  const savedLines = savedRoute
    ? buildPublicRouteLines(savedRoute.legs, itinerary.variant.color, `saved:${savedRoute.ref}`)
    : [];
  const temporaryDayLines = dayCalculation
    ? buildPublicRouteLines(dayCalculation.legs, itinerary.variant.color, `temporary:${day?.ref}`)
    : [];
  const calculatedOverviewLines = overviewCalculation
    ? buildPublicRouteLines(overviewCalculation.legs, itinerary.variant.color, "temporary:overview")
    : [];
  const overviewLines = overviewCalculation ? calculatedOverviewLines : straightOverviewLines;
  const dayLines = exploring && dayCalculation ? temporaryDayLines : savedLines;
  const lines = routeScope === "overview" ? overviewLines : dayLines;
  const dayMarkerRefs = new Set([
    ...candidates.map(({ ref }) => ref),
    ...(savedRoute?.stops.map(({ ref }) => ref) ?? []),
  ]);
  const visibleMarkers =
    routeScope === "overview"
      ? markers.filter(({ entries }) => entries.some(({ kind }) => kind === "city"))
      : markers.filter(({ itemIds }) => itemIds.some((ref) => dayMarkerRefs.has(ref)));

  function defaultStops(nextDayRef = day?.ref) {
    return publicDayRoutePlan(itinerary, nextDayRef).items.map(({ ref }) => ref);
  }

  function resetDay(nextDayRef = day?.ref) {
    setLocalStops(defaultStops(nextDayRef));
    setDayCalculation(undefined);
    setDayError(undefined);
  }

  function beginExplore() {
    resetDay(day?.ref);
    setExploringDayRef(day?.ref);
  }

  function toggleStop(ref: string, include: boolean) {
    if (ref === dayPlan.startRef || ref === dayPlan.endRef) return;
    setDayCalculation(undefined);
    setLocalStops((current) => {
      if (!include) return current.filter((candidate) => candidate !== ref);
      if (current.includes(ref)) return current;
      const next = [...current];
      const endIndex = dayPlan.endRef ? next.indexOf(dayPlan.endRef) : -1;
      next.splice(endIndex >= 0 ? endIndex : next.length, 0, ref);
      return next;
    });
  }

  function moveStop(index: number, direction: -1 | 1) {
    setDayCalculation(undefined);
    setLocalStops((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.length) return current;
      const movingRef = current[index];
      const destinationRef = current[destination];
      if (
        movingRef === dayPlan.startRef ||
        movingRef === dayPlan.endRef ||
        destinationRef === dayPlan.startRef ||
        destinationRef === dayPlan.endRef
      )
        return current;
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  function calculateDay() {
    if (!day || localStops.length < 2) {
      setDayError("Select at least two stops.");
      return;
    }
    setDayError(undefined);
    startTransition(async () => {
      const result = await calculatePublicRoute({
        dayRef: day.ref,
        legModes: Array.from({ length: localStops.length - 1 }, () => dayMode),
        stopRefs: localStops,
        token,
      });
      if ("error" in result) {
        setDayError(result.error);
        return;
      }
      setDayCalculation(result.data);
    });
  }

  function calculateOverview() {
    if (overviewStops.length < 2 || overviewStops.length > 20) {
      setOverviewError(
        overviewStops.length > 20
          ? "Whole-trip calculation supports up to 20 shared Cities."
          : "Add at least two shared Cities to calculate a route.",
      );
      return;
    }
    setOverviewError(undefined);
    startTransition(async () => {
      const result = await calculatePublicOverviewRoute({
        legModes: overviewModes,
        stopRefs: overviewStops.map(({ ref }) => ref),
        token,
      });
      if ("error" in result) {
        setOverviewError(result.error);
        return;
      }
      setOverviewCalculation(result.data);
    });
  }

  function focusItem(itemRef?: string) {
    if (!itemRef) {
      onSelectionChange(
        selectedDayRef ? { dayRef: selectedDayRef, scope: routeScope } : { scope: routeScope },
      );
      return;
    }
    const selectedDay = itinerary.days.find((candidate) =>
      candidate.items.some(({ ref }) => ref === itemRef),
    );
    if (selectedDay) {
      setDayRef(selectedDay.ref);
      onSelectionChange({ dayRef: selectedDay.ref, itemRef, scope: routeScope });
    }
    const panel = document.querySelector<HTMLElement>(`#public-${activeView}-panel`);
    const target =
      panel?.querySelector<HTMLElement>(`[data-public-item-ref="${CSS.escape(itemRef)}"]`) ??
      (selectedDay
        ? panel?.querySelector<HTMLElement>(
            `[data-public-day-ref="${CSS.escape(selectedDay.ref)}"]`,
          )
        : null);
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center",
    });
    target?.focus({ preventScroll: true });
  }

  function selectDay(nextDayRef: string) {
    setDayRef(nextDayRef);
    setExploringDayRef(undefined);
    resetDay(nextDayRef);
    onSelectionChange({ dayRef: nextDayRef, scope: "day" });
  }

  function selectScope(scope: "day" | "overview") {
    setRouteScopeOverride({ scope, view: activeView });
    if (scope === "overview") setExploringDayRef(undefined);
    onSelectionChange(scope === "day" ? { dayRef: day?.ref, scope } : { scope });
  }

  return (
    <section aria-label="Map and routes" className="relative h-full min-h-0 bg-muted/30">
      <div className="absolute inset-0 pb-[min(44%,22rem)]">
        <PlannerMapCanvas
          configurationState={{
            message: "The itinerary and shared stops remain available. Try the map again later.",
            title: "Map unavailable",
          }}
          emptyState={{
            message: "Shared plans stay available even when no mappable places were added.",
            title: "No shared map places",
          }}
          failureState={{
            message: "The itinerary and stop order remain available. Retry when ready.",
            title: "Map unavailable",
          }}
          lines={lines}
          markers={visibleMarkers}
          onMarkerClick={focusItem}
          onRetry={() => window.location.reload()}
          selectedId={selectedItemRef}
          viewportKey={`${routeScope}:${day?.ref}:${exploring ? "temporary" : "shared"}:${overviewCalculation ? "calculated" : "preview"}:${lines.length}`}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 max-h-[48%] overflow-y-auto border-t bg-background/97 p-3 backdrop-blur">
        <RouteScopePicker onSelect={selectScope} scope={routeScope} />
        {routeScope === "overview" ? (
          <PublicOverviewRoutePanel
            calculation={overviewCalculation}
            error={overviewError}
            modes={overviewModes}
            onCalculate={calculateOverview}
            onModeChange={(index, mode) => {
              setOverviewModes((current) =>
                current.map((currentMode, modeIndex) => (modeIndex === index ? mode : currentMode)),
              );
              setOverviewCalculation(undefined);
            }}
            onReset={() => {
              setOverviewCalculation(undefined);
              setOverviewError(undefined);
            }}
            pending={pending}
            stops={overviewStops}
          />
        ) : (
          <PublicDayRoutePanel
            allowExplore={itinerary.settings.allowRouteExplore}
            calculation={dayCalculation}
            candidates={candidates}
            dayMode={dayMode}
            days={itinerary.days}
            error={dayError}
            exploring={exploring}
            localStops={localStops}
            omittedActivityCount={omittedActivityCount}
            onBackToShared={() => {
              setExploringDayRef(undefined);
              setDayCalculation(undefined);
              setDayError(undefined);
            }}
            onCalculate={calculateDay}
            onExplore={beginExplore}
            onModeChange={(mode) => {
              setDayMode(mode);
              setDayCalculation(undefined);
            }}
            onMoveStop={moveStop}
            onReset={() => resetDay(day?.ref)}
            onSelectDay={selectDay}
            onToggleStop={toggleStop}
            pending={pending}
            plan={dayPlan}
            route={savedRoute}
            routeSetupItems={routeSetupItems}
          />
        )}
      </div>
    </section>
  );
}
