import { useMemo, useState, useTransition } from "react";

import { useI18n } from "@/features/i18n/i18n-provider";
import type { OverviewRouteMode, RouteLegMode } from "@/features/routes/types";

import { calculatePublicOverviewRoute, calculatePublicRoute } from "../actions";
import { focusPublicMapItem } from "../public-map-focus";
import {
  buildPublicMarkers,
  buildPublicOverviewLines,
  buildPublicRouteLines,
  orderedPublicDayStopRefs,
  publicDayRoutePlan,
  publicOverviewDefaultModes,
  publicOverviewStops,
} from "../public-map-model";
import { publicDayRoutePresentation } from "../public-route-presentation";
import type { PublicRouteCalculation } from "../types";
import type { PublicMapWorkspaceProps } from "./public-map-workspace-types";

const publicMapThemes = {
  bento: { color: "#58f58b", glyphColor: "#06100a" },
  ethereal: { color: "#667169", glyphColor: "#fffefa" },
  journal: { color: "#df8068", glyphColor: "#fffdf7" },
  neon: { color: "#42ddff", glyphColor: "#020612" },
} as const;

export function usePublicMapWorkspaceController({
  activeView,
  itinerary,
  onSelectionChange,
  selectedDayRef,
  selectedItemRef,
  selectionScope,
  templateId,
  token,
}: PublicMapWorkspaceProps) {
  const { locale } = useI18n();
  const defaultDayRef =
    selectedDayRef ?? itinerary.savedRoutes[0]?.dayRef ?? itinerary.days[0]?.ref ?? "";
  const [routeScopeOverride, setRouteScopeOverride] = useState<{
    scope: "day" | "overview";
    view: typeof activeView;
  }>();
  const [dayRef, setDayRef] = useState(defaultDayRef);
  const [exploringDayRef, setExploringDayRef] = useState<string>();
  const [dayModes, setDayModes] = useState<Record<string, RouteLegMode>>({});
  const [localStops, setLocalStops] = useState<string[]>([]);
  const [dayCalculation, setDayCalculation] = useState<PublicRouteCalculation>();
  const [overviewCalculation, setOverviewCalculation] = useState<PublicRouteCalculation>();
  const [overviewModes, setOverviewModes] = useState<OverviewRouteMode[]>(() =>
    publicOverviewDefaultModes(itinerary),
  );
  const [dayError, setDayError] = useState<string>();
  const [overviewError, setOverviewError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const mapTheme = publicMapThemes[templateId as keyof typeof publicMapThemes];
  const routeColor = mapTheme?.color ?? itinerary.variant.color;
  const markers = useMemo(
    () => buildPublicMarkers(itinerary, mapTheme, locale),
    [itinerary, locale, mapTheme],
  );
  const overviewStops = useMemo(() => publicOverviewStops(itinerary), [itinerary]);
  const straightOverviewLines = useMemo(
    () => buildPublicOverviewLines(itinerary, routeColor),
    [itinerary, routeColor],
  );
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
  const { omittedActivityCount, routeSetupItems, savedLines, savedRoute, temporaryDayLines } =
    publicDayRoutePresentation(itinerary, dayPlan, dayCalculation, routeColor);
  const calculatedOverviewLines = overviewCalculation
    ? buildPublicRouteLines(overviewCalculation.legs, routeColor, "temporary:overview")
    : [];
  const overviewLines = overviewCalculation ? calculatedOverviewLines : straightOverviewLines;
  const dayLines = exploring && dayCalculation ? temporaryDayLines : savedLines;
  const lines = routeScope === "overview" ? overviewLines : dayLines;
  const dayMarkerRefs = new Set([
    ...candidates.map(({ ref }) => ref),
    ...(savedRoute?.stops.map(({ ref }) => ref) ?? []),
    ...(selectedItemRef ? [selectedItemRef] : []),
  ]);
  const visibleMarkers =
    routeScope === "overview"
      ? markers.filter(({ entries }) => entries.some(({ kind }) => kind === "city"))
      : markers.filter(({ itemIds }) => itemIds.some((ref) => dayMarkerRefs.has(ref)));
  const dayLegModes = localStops
    .slice(0, -1)
    .map((ref, index) => dayModes[`${ref}:${localStops[index + 1]}`] ?? "self_driving");

  function defaultStops(nextDayRef = day?.ref) {
    return publicDayRoutePlan(itinerary, nextDayRef).items.map(({ ref }) => ref);
  }

  function resetDay(nextDayRef = day?.ref) {
    setLocalStops(defaultStops(nextDayRef));
    setDayModes({});
    setDayCalculation(undefined);
    setDayError(undefined);
  }

  function toggleStop(ref: string, include: boolean) {
    setDayCalculation(undefined);
    setLocalStops((current) => {
      const selected = new Set(current);
      if (include) selected.add(ref);
      else selected.delete(ref);
      return orderedPublicDayStopRefs(dayPlan, selected);
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
        legModes: dayLegModes,
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
          ? "Whole-trip calculation supports up to 20 shared stages."
          : "Add at least two shared stages to calculate a route.",
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

  return {
    dayPanel: {
      allowExplore: itinerary.settings.allowRouteExplore,
      calculation: dayCalculation,
      candidates,
      legModes: dayLegModes,
      days: itinerary.days,
      error: dayError,
      exploring,
      localStops,
      omittedActivityCount,
      onBackToShared: () => {
        setExploringDayRef(undefined);
        setDayCalculation(undefined);
        setDayError(undefined);
      },
      onCalculate: calculateDay,
      onEdit: () => {
        setDayCalculation(undefined);
        setDayError(undefined);
      },
      onExplore: () => {
        resetDay(day?.ref);
        setExploringDayRef(day?.ref);
      },
      onModeChange: (index: number, mode: RouteLegMode) => {
        const from = localStops[index];
        const to = localStops[index + 1];
        if (!from || !to) return;
        setDayModes((current) => ({ ...current, [`${from}:${to}`]: mode }));
        setDayCalculation(undefined);
      },
      onReset: () => resetDay(day?.ref),
      onSelectDay: selectDay,
      onToggleStop: toggleStop,
      pending,
      plan: dayPlan,
      route: savedRoute,
      routeSetupItems,
    },
    map: {
      colorScheme: templateId === "bento" || templateId === "neon" ? ("DARK" as const) : undefined,
      lines,
      markers: visibleMarkers,
      onMarkerClick: (itemRef?: string) =>
        focusPublicMapItem({
          activeView,
          itinerary,
          itemRef,
          onSelectionChange,
          routeScope,
          selectedDayRef,
          setDayRef,
        }),
      selectedId: selectedItemRef,
      viewportKey: `${routeScope}:${day?.ref}:${exploring ? "temporary" : "shared"}:${overviewCalculation ? "calculated" : "preview"}:${lines.length}`,
    },
    overviewPanel: {
      allowExplore: itinerary.settings.allowRouteExplore,
      calculation: overviewCalculation,
      error: overviewError,
      modes: overviewModes,
      onCalculate: calculateOverview,
      onModeChange: (index: number, mode: OverviewRouteMode) => {
        setOverviewModes((current) =>
          current.map((currentMode, modeIndex) => (modeIndex === index ? mode : currentMode)),
        );
        setOverviewCalculation(undefined);
      },
      onReset: () => {
        setOverviewCalculation(undefined);
        setOverviewError(undefined);
      },
      pending,
      stops: overviewStops,
    },
    routeScope,
    selectScope,
  };
}
