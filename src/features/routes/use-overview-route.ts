"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";

import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import type { RouteMode } from "@/lib/telemetry/events";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { usePlannerPersistence } from "@/features/itinerary/planner-persistence";

import { isOverviewRouteLeg, type OverviewStage } from "./overview";
import { useRouteTasks } from "./use-route-tasks";
import { overviewTaskKey } from "./route-task-runtime";
import { matchingOverviewResults, type OverviewTaskResult } from "./overview-results";
import { overviewInputSnapshot } from "./input-snapshot";
import type { OverviewRouteMode } from "./types";

type OverviewRouteState = {
  generation?: number;
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
  const persistence = usePlannerPersistence();
  const stageKey = keyForStages(stages, defaultModes, variantId);
  const scope = useDraftScope(tripId, "routes");
  const local = useDurableFields(editingStorageKey(scope, "overview"), {
    states: {} as Record<string, OverviewRouteState>,
  });
  const [editing, setEditing] = useState(false);
  const runtime = useRouteTasks(tripId, variantId);
  const taskScope = useDraftScope(tripId, variantId);
  const { data: results } = useQuery<OverviewTaskResult[]>({
    queryKey: overviewTaskKey(taskScope),
    initialData: [],
    enabled: false,
  });
  const currentState: OverviewRouteState = local.values.states[stageKey]
    ? local.values.states[stageKey]
    : { calculatedLegs: [], modes: [...defaultModes], stageKey };
  const durableLegs = matchingOverviewResults(
    results,
    stageKey,
    currentState.generation ?? 0,
    currentState.modes,
  );
  const calculatedLegs = [
    ...currentState.calculatedLegs.filter(
      (leg) => !durableLegs.some((row) => row.position === leg.position),
    ),
    ...durableLegs,
  ].sort((a, b) => a.position - b.position);
  const operations =
    runtime?.queue.operations.filter(
      (op) =>
        (op.intent as { kind: string; stageKey?: string }).kind === "overview" &&
        (op.intent as { stageKey?: string }).stageKey === stageKey,
    ) ?? [];

  function updateState(updater: (current: OverviewRouteState) => OverviewRouteState) {
    local.set("states", (states) => ({
      ...states,
      [stageKey]: updater(
        states[stageKey] ?? { calculatedLegs: [], modes: [...defaultModes], stageKey },
      ),
    }));
  }

  const segments = stages.slice(1).flatMap((to, index): OverviewRouteSegment[] => {
    const from = stages[index];
    if (!isOverviewRouteLeg(from, to)) return [];
    return [
      {
        calculatedLeg: calculatedLegs.find(({ position }) => position === index + 1),
        from,
        mode: currentState.modes[index],
        position: index + 1,
        to,
      },
    ];
  });

  async function calculate() {
    if (persistence) {
      persistence.requestAccountFeature("route");
      return;
    }
    const changed = segments.filter(({ calculatedLeg, mode }) => mode && !calculatedLeg);
    const submittedModes = [...currentState.modes];
    const submittedGeneration = currentState.generation ?? 0;
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
      if (!runtime)
        throw new Error(
          "The calculation request could not be stored locally. Your configuration is kept.",
        );
      runtime.accept({
        kind: "overview",
        stageKey,
        generation: submittedGeneration,
        modes: submittedModes.map((mode) => mode ?? null),
        input: {
          legs: changed.map(({ mode, position }) => ({ mode: mode!, position })),
          tripId,
          variantId,
          operationId,
          telemetryRouteMode: routeMode,
          expectedInputSnapshot: overviewInputSnapshot(stages),
        },
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
    calculatedLegs,
    editing,
    error:
      currentState.error ??
      operations.find((op) => op.status === "failed" || op.status === "conflict")?.error ??
      local.error,
    pending: operations.some((op) => op.status === "queued" || op.status === "sending"),
    reset: () => {
      updateState((current) => ({
        calculatedLegs: [],
        modes: [...defaultModes],
        stageKey,
        generation: (current.generation ?? 0) + 1,
      }));
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
        { actorType: persistence?.actorType ?? "authenticated" },
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
