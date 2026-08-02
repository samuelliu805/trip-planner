"use client";

import { useState } from "react";

import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";

import type { OverviewStage } from "./overview";
import { useCalculateOverviewRoute } from "./queries";
import type { RouteLegMode } from "./types";

type OverviewRouteState = {
  calculatedLegs: CalculatedRouteLeg[];
  error?: string;
  modes: Array<RouteLegMode | undefined>;
  stageKey: string;
};

export type OverviewRouteSegment = {
  calculatedLeg?: CalculatedRouteLeg;
  from: OverviewStage;
  mode?: RouteLegMode;
  position: number;
  to: OverviewStage;
};

export type OverviewRouteUi = {
  calculate: () => Promise<void>;
  calculatedLegs: CalculatedRouteLeg[];
  editing: boolean;
  error?: string;
  pending: boolean;
  reset: () => void;
  segments: OverviewRouteSegment[];
  setEditing: (editing: boolean) => void;
  setMode: (position: number, mode: RouteLegMode) => void;
  stages: OverviewStage[];
};

const keyForStages = (stages: OverviewStage[]) =>
  stages
    .map(
      ({ entries, latitude, longitude, placeId }) =>
        `${placeId}:${latitude.toFixed(7)}:${longitude.toFixed(7)}:${entries[0]?.itemId ?? ""}`,
    )
    .join("|");

export function useOverviewRoute(stages: OverviewStage[], tripId: string): OverviewRouteUi {
  const stageKey = keyForStages(stages);
  const segmentCount = Math.max(0, stages.length - 1);
  const [storedState, setStoredState] = useState<OverviewRouteState | null>(null);
  const [editing, setEditing] = useState(false);
  const mutation = useCalculateOverviewRoute();
  const currentState: OverviewRouteState =
    storedState?.stageKey === stageKey
      ? storedState
      : { calculatedLegs: [], modes: Array<RouteLegMode | undefined>(segmentCount), stageKey };

  function updateState(updater: (current: OverviewRouteState) => OverviewRouteState) {
    setStoredState((stored) =>
      updater(
        stored?.stageKey === stageKey
          ? stored
          : { calculatedLegs: [], modes: Array(segmentCount), stageKey },
      ),
    );
  }

  const segments = stages.slice(1).map((to, index) => ({
    calculatedLeg: currentState.calculatedLegs.find(({ position }) => position === index + 1),
    from: stages[index],
    mode: currentState.modes[index],
    position: index + 1,
    to,
  }));

  async function calculate() {
    if (!segments.length) return;
    if (segments.some(({ mode }) => !mode)) {
      updateState((current) => ({
        ...current,
        error: "Select a transport mode for every City connection.",
      }));
      return;
    }
    const changed = segments.filter(({ calculatedLeg }) => !calculatedLeg);
    if (!changed.length) {
      setEditing(false);
      return;
    }
    updateState((current) => ({ ...current, error: undefined }));
    try {
      const calculated = await mutation.mutateAsync({
        legs: changed.map(({ mode, position }) => ({ mode: mode!, position })),
        tripId,
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
      setStoredState({ calculatedLegs: [], modes: Array(segmentCount), stageKey });
      setEditing(false);
    },
    segments,
    setEditing,
    setMode: (position, mode) =>
      updateState((current) => ({
        ...current,
        calculatedLegs: current.calculatedLegs.filter(
          (calculated) => calculated.position !== position,
        ),
        error: undefined,
        modes: current.modes.map((candidate, index) => (index === position - 1 ? mode : candidate)),
      })),
    stages,
  };
}
