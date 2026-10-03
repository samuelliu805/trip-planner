import { useMemo, useState, useTransition } from "react";

import { useI18n } from "@/features/i18n/i18n-provider";
import type { OverviewRouteMode } from "@/features/routes/types";

import { calculatePublicOverviewRoute } from "../actions";
import { focusPublicMapItem } from "../public-map-focus";
import {
  buildPublicMarkers,
  buildPublicOverviewLines,
  buildPublicRouteLines,
  publicDayRoutePlan,
  publicOverviewDefaultModes,
  publicOverviewStops,
} from "../public-map-model";
import { publicDayRoutePresentation } from "../public-route-presentation";
import type { PublicRouteCalculation } from "../types";
import type { PublicMapWorkspaceProps } from "./public-map-workspace-types";
import { usePublicDayRoute } from "./use-public-day-route";

const publicMapThemes = {
  bento: { color: "#58f58b", glyphColor: "#06100a" },
  ethereal: { color: "#667169", glyphColor: "#fffefa" },
  journal: { color: "#df8068", glyphColor: "#fffdf7" },
  neon: { color: "#42ddff", glyphColor: "#020612" },
} as const;

export function usePublicMapWorkspaceController(
  {
    activeView,
    itinerary,
    onSelectionChange,
    selectedDayRef,
    selectedItemRef,
    selectionScope,
    templateId,
    token,
  }: PublicMapWorkspaceProps,
  onCalculated?: () => void,
) {
  const { locale } = useI18n();
  const defaultDayRef =
    selectedDayRef ?? itinerary.savedRoutes[0]?.dayRef ?? itinerary.days[0]?.ref ?? "";
  const [routeScopeOverride, setRouteScopeOverride] = useState<{
    scope: "day" | "overview";
    view: typeof activeView;
  }>();
  const [dayRef, setDayRef] = useState(defaultDayRef);
  const [overviewCalculation, setOverviewCalculation] = useState<PublicRouteCalculation>();
  const [overviewModes, setOverviewModes] = useState<OverviewRouteMode[]>(() =>
    publicOverviewDefaultModes(itinerary),
  );
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
  const candidates = dayPlan.items;
  const { omittedActivityCount, routeSetupItems, savedLines, savedRoute } =
    publicDayRoutePresentation(itinerary, dayPlan, undefined, routeColor);
  const dayRoute = usePublicDayRoute({
    active: routeScope === "day",
    allowExplore: itinerary.settings.allowRouteExplore,
    onCalculated,
    plan: dayPlan,
    route: savedRoute,
    token,
  });
  const { calculation: dayCalculation, exploring } = dayRoute;
  const calculatedOverviewLines = overviewCalculation
    ? buildPublicRouteLines(overviewCalculation.legs, routeColor, "temporary:overview")
    : [];
  const overviewLines = overviewCalculation ? calculatedOverviewLines : straightOverviewLines;
  const dayLines =
    exploring && dayCalculation
      ? buildPublicRouteLines(dayCalculation.legs, routeColor, `temporary:${day?.ref}`)
      : savedLines;
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
      onCalculated?.();
    });
  }

  function selectDay(nextDayRef: string) {
    setDayRef(nextDayRef);
    onSelectionChange({ dayRef: nextDayRef, scope: "day" });
  }

  function selectScope(scope: "day" | "overview") {
    setRouteScopeOverride({ scope, view: activeView });
    onSelectionChange(scope === "day" ? { dayRef: day?.ref, scope } : { scope });
  }

  return {
    dayPanel: {
      allowExplore: itinerary.settings.allowRouteExplore,
      ...dayRoute,
      candidates,
      days: itinerary.days,
      omittedActivityCount,
      onSelectDay: selectDay,
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
