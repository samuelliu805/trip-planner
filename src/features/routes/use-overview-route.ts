"use client";

import { useState } from "react";

import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import type { RouteMode } from "@/lib/telemetry/events";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { isOverviewRouteLeg, type OverviewStage } from "./overview";
import { useCalculateOverviewRoute } from "./queries";
import type { OverviewRouteMode } from "./types";

type OverviewRouteState = {
  calculatedLegs: CalculatedRouteLeg[];
  error?: string;
  modes: Array<OverviewRouteMode | undefined>;
  stageKey: string;
};

export type OverviewRouteSegment = {
  calculatedLeg?: CalculatedRouteLeg;
  from: OverviewStage;
  mode?: OverviewRouteMode;
  position: number;
  to: OverviewStage;
};

export type OverviewRouteUi = {
  calculate: () => Promise<void>;
  calculatedLegs: CalculatedRouteLeg[];
  configurationError?: string;
  editing: boolean;
  error?: string;
  pending: boolean;
  reset: () => void;
  segments: OverviewRouteSegment[];
  setEditing: (editing: boolean) => void;
  setMode: (position: number, mode?: OverviewRouteMode) => void;
  stages: OverviewStage[];
};

const keyForStages = (
  stages: OverviewStage[],
  defaultModes: Array<OverviewRouteMode | undefined>,
  variantId: string,
) =>
  `${variantId}:${stages
    .map(
      ({ entries, latitude, longitude, placeId }) =>
        `${placeId}:${latitude.toFixed(7)}:${longitude.toFixed(7)}:${entries[0]?.itemId ?? ""}`,
    )
    .join("|")}:${defaultModes.join(",")}`;

export function useOverviewRoute(
  stages: OverviewStage[],
  defaultModes: Array<OverviewRouteMode | undefined>,
  tripId: string,
  variantId: string,
): OverviewRouteUi {
  const stageKey = keyForStages(stages, defaultModes, variantId);
  const [storedState, setStoredState] = useState<OverviewRouteState | null>(null);
  const [editing, setEditing] = useState(false);
  const mutation = useCalculateOverviewRoute();
  const currentState: OverviewRouteState =
    storedState?.stageKey === stageKey
      ? storedState
      : { calculatedLegs: [], modes: [...defaultModes], stageKey };

  function updateState(updater: (current: OverviewRouteState) => OverviewRouteState) {
    setStoredState((stored) =>
      updater(
        stored?.stageKey === stageKey
          ? stored
          : { calculatedLegs: [], modes: [...defaultModes], stageKey },
      ),
    );
  }

  const segments = stages.slice(1).flatMap((to, index): OverviewRouteSegment[] => {
    const from = stages[index];
    if (!isOverviewRouteLeg(from, to)) return [];
    return [
      {
        calculatedLeg: currentState.calculatedLegs.find(({ position }) => position === index + 1),
        from,
        mode: currentState.modes[index],
        position: index + 1,
        to,
      },
    ];
  });

  async function calculate() {
    const changed = segments.filter(({ calculatedLeg, mode }) => mode && !calculatedLeg);
    if (!changed.length) {
      setEditing(false);
      return;
    }
    updateState((current) => ({ ...current, error: undefined }));
    const operationId = newTelemetryOperationId();
    const uniqueModes = new Set(changed.map(({ mode }) => mode));
    const routeMode: RouteMode =
      uniqueModes.size === 1 ? ([...uniqueModes][0] as RouteMode) : "mixed";
    captureBrowserProductEvent(
      "route_calculation_started",
      {
        operation_id: operationId,
        route_mode: routeMode,
        route_view: "overview",
        surface: "route_panel",
      },
      { actorType: "authenticated" },
    );
    try {
      const calculated = await mutation.mutateAsync({
        legs: changed.map(({ mode, position }) => ({ mode: mode!, position })),
        tripId,
        variantId,
        operationId,
        telemetryRouteMode: routeMode,
      });
      updateState((current) => {
        const changedPositions = new Set(calculated.map(({ position }) => position));
        return {
          ...current,
          calculatedLegs: [
            ...current.calculatedLegs.filter(({ position }) => !changedPositions.has(position)),
            ...calculated,
          ].sort((a, b) => a.position - b.position),
          error: undefined,
        };
      });
      setEditing(false);
    } catch (error) {
      updateState((current) => ({
        ...current,
        error:
          error instanceof Error ? error.message : "The Overview route could not be calculated.",
      }));
    }
  }

  return {
    calculate,
    calculatedLegs: currentState.calculatedLegs,
    editing,
    error: currentState.error,
    pending: mutation.isPending,
    reset: () => {
      setStoredState({ calculatedLegs: [], modes: [...defaultModes], stageKey });
      setEditing(false);
    },
    segments,
    setEditing,
    setMode: (position, mode) => {
      if (currentState.modes[position - 1] === mode) return;
      captureBrowserProductEvent(
        "route_mode_changed",
        {
          operation_id: newTelemetryOperationId(),
          route_mode: mode ?? "unset",
          route_view: "overview",
          surface: "route_panel",
        },
        { actorType: "authenticated" },
      );
      updateState((current) => ({
        ...current,
        calculatedLegs: current.calculatedLegs.filter(
          (calculated) => calculated.position !== position,
        ),
        error: undefined,
        modes: current.modes.map((candidate, index) => (index === position - 1 ? mode : candidate)),
      }));
    },
    stages,
  };
}
