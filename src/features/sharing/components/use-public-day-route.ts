import { useEffect, useRef, useState, useTransition } from "react";

import { canCalculateRouteStops } from "@/features/routes/route-readiness";
import { canonicalRouteLegMode, type RouteLegMode } from "@/features/routes/types";

import { calculatePublicRoute } from "../actions";
import { orderedPublicDayStopRefs, publicDayRoutePlan } from "../public-map-model";
import type { PublicRouteCalculation, PublicSavedRoute } from "../types";

type DayRouteState = {
  calculation?: PublicRouteCalculation;
  error?: string;
  modes: Record<string, RouteLegMode>;
  pending: boolean;
  phase: "shared" | "editing" | "calculated";
  stops: string[];
};

function defaultStops(plan: ReturnType<typeof publicDayRoutePlan>) {
  return plan.items.map(({ ref }) => ref);
}

function defaultDayState(
  plan: ReturnType<typeof publicDayRoutePlan>,
  route?: PublicSavedRoute,
): DayRouteState {
  const modes: Record<string, RouteLegMode> = {};
  route?.legs.forEach((leg) => {
    const from = route.stops[leg.position - 1]?.ref;
    const to = route.stops[leg.position]?.ref;
    if (from && to) modes[from + ":" + to] = canonicalRouteLegMode(leg.mode);
  });
  return {
    modes,
    pending: false,
    phase: route?.status === "calculated" ? "shared" : "editing",
    stops: defaultStops(plan),
  };
}

export function usePublicDayRoute({
  active,
  allowExplore,
  onCalculated,
  plan,
  route,
  token,
}: {
  active: boolean;
  allowExplore: boolean;
  onCalculated?: () => void;
  plan: ReturnType<typeof publicDayRoutePlan>;
  route?: PublicSavedRoute;
  token: string;
}) {
  const [states, setStates] = useState<Record<string, DayRouteState>>({});
  const [, startTransition] = useTransition();
  const dayRef = plan.day?.ref ?? "";
  const activeDayRef = useRef(dayRef);
  useEffect(() => {
    activeDayRef.current = active ? dayRef : "";
    return () => {
      activeDayRef.current = "";
    };
  }, [active, dayRef]);
  const initialState = defaultDayState(plan, route);
  const state = states[dayRef] ?? initialState;
  const localStops = state.stops;
  const dayLegModes = localStops
    .slice(0, -1)
    .map((ref, index) => state.modes[`${ref}:${localStops[index + 1]}`] ?? "self_driving");
  const canCalculate = canCalculateRouteStops(
    localStops.map((ref) => plan.items.find((item) => item.ref === ref)?.place),
  );

  function updateState(update: (current: DayRouteState) => DayRouteState) {
    setStates((current) => ({
      ...current,
      [dayRef]: update(current[dayRef] ?? initialState),
    }));
  }

  function edit() {
    if (!allowExplore || state.pending) return;
    updateState((current) => ({ ...current, error: undefined, phase: "editing" }));
  }

  function calculate() {
    if (!allowExplore || state.pending) return;
    if (!dayRef || !canCalculate) {
      updateState((current) => ({
        ...current,
        error: "Select two different mapped places to calculate a route.",
      }));
      return;
    }
    updateState((current) => ({ ...current, error: undefined, pending: true, phase: "editing" }));
    startTransition(async () => {
      try {
        const result = await calculatePublicRoute({
          dayRef,
          legModes: dayLegModes,
          stopRefs: localStops,
          token,
        });
        if ("error" in result) {
          updateState((current) => ({ ...current, error: result.error, pending: false }));
          return;
        }
        updateState((current) => ({
          ...current,
          calculation: result.data,
          pending: false,
          phase: "calculated",
        }));
        if (activeDayRef.current === dayRef) onCalculated?.();
      } catch {
        updateState((current) => ({
          ...current,
          error: "Route unavailable. Keep the stop sequence and try again.",
          pending: false,
        }));
      }
    });
  }

  return {
    calculation: state.phase === "calculated" ? state.calculation : undefined,
    canCalculate,
    error: state.error,
    exploring: allowExplore && state.phase !== "shared",
    legModes: dayLegModes,
    localStops,
    onBackToShared: () => {
      if (state.pending) return;
      updateState((current) => ({
        ...current,
        error: undefined,
        phase: route?.status === "calculated" ? "shared" : "editing",
      }));
    },
    onCalculate: calculate,
    onEdit: edit,
    onExplore: edit,
    onModeChange: (index: number, mode: RouteLegMode) => {
      const from = localStops[index];
      const to = localStops[index + 1];
      if (!allowExplore || state.pending || !from || !to) return;
      updateState((current) => ({
        ...current,
        calculation: undefined,
        error: undefined,
        modes: { ...current.modes, [from + ":" + to]: mode },
        phase: "editing",
      }));
    },
    onReset: () => {
      if (!allowExplore || state.pending) return;
      updateState(() => ({ ...defaultDayState(plan, route), phase: "editing" }));
    },
    onToggleStop: (ref: string, include: boolean) => {
      if (!allowExplore || state.pending) return;
      updateState((current) => {
        const selected = new Set(current.stops);
        if (include) selected.add(ref);
        else selected.delete(ref);
        return {
          ...current,
          calculation: undefined,
          error: undefined,
          phase: "editing",
          stops: orderedPublicDayStopRefs(plan, selected),
        };
      });
    },
    pending: state.pending,
  };
}
