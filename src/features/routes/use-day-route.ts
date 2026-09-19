"use client";

import { useMemo, useState } from "react";

import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "@/features/itinerary/types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";
import { usePlannerPersistence } from "@/features/itinerary/planner-persistence";

import { eligibleDayRouteItems } from "./day-route-map";
import { defaultDayRouteDraft } from "./day-route-default-draft";
import { fixedDayRouteDraft } from "./day-route-order";
import { synchronizeSavedDayRouteDraft } from "./day-route-synchronization";
import { resolveRouteCalculationConfig } from "./plan-config";
import { dayRouteStatus, type DayRouteStatus } from "./status";
import { suggestedDraftLegMode } from "./transport-suggestion";
import { useDayRouteActions } from "./use-day-route-actions";
import { canonicalRouteLegMode, type DayRoutePlan, type RouteLegMode } from "./types";

export type DayRouteEditorDraft = { itemIds: string[]; legModes: RouteLegMode[] };

export type DayRouteUi = {
  activeDay?: PlannerDay;
  addStop: (itemId: string) => void;
  cancelEditing: () => void;
  clearRoute: () => Promise<void>;
  displayDraft: DayRouteEditorDraft | null;
  draft: DayRouteEditorDraft | null;
  editing: boolean;
  eligibleItems: ItineraryItem[];
  error?: string;
  conflict: boolean;
  fitKey?: string;
  openCreate: () => void;
  openEdit: () => void;
  pending: boolean;
  plan?: DayRoutePlan;
  previousDay?: PlannerDay;
  recalculate: () => Promise<void>;
  removeItem: (itemId: string) => void;
  removeStop: (index: number) => void;
  reloadLatest: () => Promise<void>;
  saveAndCalculate: () => Promise<void>;
  setLegMode: (index: number, mode: RouteLegMode) => void;
  status?: DayRouteStatus;
  stopItems: ItineraryItem[];
};

const savedDraft = (plan: DayRoutePlan): DayRouteEditorDraft => ({
  itemIds: [...plan.stops].sort((a, b) => a.position - b.position).map(({ item_id }) => item_id),
  legModes: [...plan.legs]
    .sort((a, b) => a.position - b.position)
    .map(({ mode }) => canonicalRouteLegMode(mode)),
});

export function useDayRoute(
  workspace: PlannerWorkspace,
  activeDay: PlannerDay | undefined,
  tripId: string,
): DayRouteUi {
  const persistence = usePlannerPersistence();
  const [draftState, setDraftState] = useState<{
    dayId: string;
    value: DayRouteEditorDraft;
  } | null>(null);
  const [errorState, setErrorState] = useState<{ dayId: string; value: string } | null>(null);
  const [conflictDayId, setConflictDayId] = useState<string>();
  const rawDraft = draftState && draftState.dayId === activeDay?.id ? draftState.value : null;
  const error = errorState && errorState.dayId === activeDay?.id ? errorState.value : undefined;
  const conflict = conflictDayId === activeDay?.id;
  const plan = workspace.routePlans.find(
    (candidate) =>
      candidate.day_id === activeDay?.id && candidate.variant_id === workspace.variant.id,
  );
  const previousDay = activeDay
    ? workspace.days.find(({ day_number }) => day_number === activeDay.day_number - 1)
    : undefined;
  const eligibleItems = useMemo(() => eligibleDayRouteItems(activeDay), [activeDay]);
  const previousHotel = useMemo(
    () => eligibleDayRouteItems(previousDay).find(({ type }) => type === "hotel"),
    [previousDay],
  );
  const currentHotel = eligibleItems.find(({ type }) => type === "hotel");
  const stopItems = useMemo(
    () => (previousHotel ? [previousHotel, ...eligibleItems] : eligibleItems),
    [eligibleItems, previousHotel],
  );
  const suggestedMode = useMemo(
    () => suggestedDraftLegMode(activeDay?.items ?? []),
    [activeDay?.items],
  );
  const draft = useMemo(
    () =>
      rawDraft
        ? fixedDayRouteDraft(
            rawDraft,
            eligibleItems.map(({ id }) => id),
            suggestedMode,
            previousHotel?.id,
            currentHotel?.id,
          )
        : null,
    [currentHotel?.id, eligibleItems, previousHotel?.id, rawDraft, suggestedMode],
  );
  const synchronized = useMemo(
    () =>
      plan
        ? synchronizeSavedDayRouteDraft(
            savedDraft(plan),
            eligibleItems,
            suggestedMode,
            plan.updated_at,
            previousHotel,
          )
        : null,
    [eligibleItems, plan, previousHotel, suggestedMode],
  );
  const displayDraft = draft ?? synchronized?.draft ?? null;
  const variantId = workspace.variant.id;
  function setError(value?: string) {
    setErrorState(value && activeDay ? { dayId: activeDay.id, value } : null);
  }

  function setDraft(value: DayRouteEditorDraft | null) {
    setDraftState(value && activeDay ? { dayId: activeDay.id, value } : null);
  }

  function updateDraft(updater: (current: DayRouteEditorDraft) => DayRouteEditorDraft) {
    if (!activeDay) return;
    setDraftState((current) =>
      current?.dayId === activeDay.id
        ? { dayId: activeDay.id, value: updater(current.value) }
        : current,
    );
    setError(undefined);
  }

  function addStop(itemId: string) {
    const item = eligibleItems.find(({ id }) => id === itemId);
    if (!item) return;
    updateDraft((current) => {
      if (current.itemIds.includes(itemId)) return current;
      return fixedDayRouteDraft(
        { itemIds: [...current.itemIds, itemId], legModes: current.legModes },
        eligibleItems.map(({ id }) => id),
        suggestedMode,
        previousHotel?.id,
        currentHotel?.id,
      );
    });
  }

  function removeStop(index: number) {
    updateDraft((current) => {
      if (!current.itemIds[index]) return current;
      return fixedDayRouteDraft(
        {
          itemIds: current.itemIds.filter((_, candidate) => candidate !== index),
          legModes: current.legModes,
        },
        eligibleItems.map(({ id }) => id),
        suggestedMode,
        previousHotel?.id,
        currentHotel?.id,
      );
    });
  }

  function removeItem(itemId: string) {
    updateDraft((current) => {
      const indexes = current.itemIds
        .map((candidate, index) => (candidate === itemId ? index : -1))
        .filter((index) => index >= 0)
        .sort((a, b) => b - a);
      let next = current;
      for (const index of indexes) {
        next = fixedDayRouteDraft(
          {
            itemIds: next.itemIds.filter((_, candidate) => candidate !== index),
            legModes: next.legModes,
          },
          eligibleItems.map(({ id }) => id),
          suggestedMode,
          previousHotel?.id,
          currentHotel?.id,
        );
      }
      return next;
    });
  }

  function setLegMode(index: number, mode: RouteLegMode) {
    const canonicalMode = canonicalRouteLegMode(mode);
    if (draft?.legModes[index] === canonicalMode) return;
    captureBrowserProductEvent(
      "route_mode_changed",
      {
        operation_id: newTelemetryOperationId(),
        route_mode: canonicalMode,
        route_view: "day",
        surface: "route_panel",
      },
      { actorType: persistence?.actorType ?? "authenticated" },
    );
    updateDraft((current) => ({
      ...current,
      legModes: current.legModes.map((candidate, candidateIndex) =>
        candidateIndex === index ? canonicalMode : candidate,
      ),
    }));
  }

  const { clearRoute, pending, persistAndCalculate, reloadLatest } = useDayRouteActions({
    activeDay,
    actorType: persistence?.actorType ?? "authenticated",
    plan,
    previousDay,
    setConflictDayId,
    setDraft,
    setError,
    stopItems,
    tripId,
    variantId,
  });

  async function saveAndCalculate() {
    await persistAndCalculate(draft);
  }

  const baseStatus = plan ? dayRouteStatus(workspace, plan) : undefined;
  const saved = plan ? savedDraft(plan) : null;
  const synchronizedChanged = Boolean(
    saved &&
    synchronized &&
    (saved.itemIds.join("\u0000") !== synchronized.draft.itemIds.join("\u0000") ||
      saved.legModes.join("\u0000") !== synchronized.draft.legModes.join("\u0000")),
  );
  const status =
    baseStatus === "needs_edit" ? baseStatus : synchronizedChanged ? "stale" : baseStatus;
  const resolved = plan ? resolveRouteCalculationConfig(workspace, plan) : undefined;
  const calculatedFitKey = plan?.calculation?.computed_at;
  const defaultDraft = () => defaultDayRouteDraft(eligibleItems, suggestedMode, previousHotel);

  return {
    activeDay,
    addStop,
    cancelEditing: () => {
      setDraft(null);
      setError(undefined);
    },
    clearRoute,
    conflict,
    displayDraft,
    draft,
    editing: draft !== null,
    eligibleItems,
    error: error ?? (!resolved?.config && plan ? resolved?.error : undefined),
    fitKey: calculatedFitKey ? `day-route:${activeDay?.id}:${calculatedFitKey}` : undefined,
    openCreate: () => {
      if (persistence) {
        persistence.requestAccountFeature("route");
        return;
      }
      setDraft(defaultDraft());
      setError(undefined);
    },
    openEdit: () => {
      if (persistence) {
        persistence.requestAccountFeature("route");
        return;
      }
      if (plan) setDraft(synchronized?.draft ?? savedDraft(plan));
      else setDraft(defaultDraft());
      setError(undefined);
    },
    pending,
    plan,
    previousDay,
    recalculate: () => persistAndCalculate(synchronized?.draft ?? null),
    removeItem,
    removeStop,
    reloadLatest,
    saveAndCalculate,
    setLegMode,
    status,
    stopItems,
  };
}
