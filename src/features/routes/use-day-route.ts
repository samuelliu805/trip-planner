"use client";

import { useMemo, useState } from "react";

import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "@/features/itinerary/types";

import { eligibleDayRouteItems } from "./day-route-map";
import { fixedDayRouteDraft } from "./day-route-order";
import { resolveRouteCalculationConfig } from "./plan-config";
import { useCalculateDayRoute, useClearDayRoutePlan, useSaveDayRoutePlan } from "./queries";
import { validateDayRouteDraft } from "./route-config";
import { dayRouteStatus, type DayRouteStatus } from "./status";
import { suggestedDraftLegMode } from "./transport-suggestion";
import type { DayRouteDraft, DayRoutePlan, RouteLegMode } from "./types";

export type DayRouteEditorDraft = { itemIds: string[]; legModes: RouteLegMode[] };

export type DayRouteUi = {
  activeDay?: PlannerDay;
  addStop: (itemId: string) => void;
  cancelEditing: () => void;
  clearRoute: () => Promise<void>;
  draft: DayRouteEditorDraft | null;
  editing: boolean;
  eligibleItems: ItineraryItem[];
  error?: string;
  fitKey?: string;
  hotelTransferAvailable: boolean;
  openCreate: () => void;
  openEdit: () => void;
  pending: boolean;
  plan?: DayRoutePlan;
  previousDay?: PlannerDay;
  removeItem: (itemId: string) => void;
  removeStop: (index: number) => void;
  saveAndCalculate: () => Promise<void>;
  setLegMode: (index: number, mode: RouteLegMode) => void;
  status?: DayRouteStatus;
  stopItems: ItineraryItem[];
  useHotelRoundTrip: () => void;
};

const savedDraft = (plan: DayRoutePlan): DayRouteEditorDraft => ({
  itemIds: [...plan.stops].sort((a, b) => a.position - b.position).map(({ item_id }) => item_id),
  legModes: [...plan.legs].sort((a, b) => a.position - b.position).map(({ mode }) => mode),
});

export function useDayRoute(
  workspace: PlannerWorkspace,
  activeDay: PlannerDay | undefined,
  tripId: string,
): DayRouteUi {
  const [draftState, setDraftState] = useState<{
    dayId: string;
    value: DayRouteEditorDraft;
  } | null>(null);
  const [errorState, setErrorState] = useState<{ dayId: string; value: string } | null>(null);
  const draft = draftState && draftState.dayId === activeDay?.id ? draftState.value : null;
  const error = errorState && errorState.dayId === activeDay?.id ? errorState.value : undefined;
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
  const variantId = workspace.variant.id;
  const saveMutation = useSaveDayRoutePlan(tripId, variantId);
  const calculateMutation = useCalculateDayRoute(tripId, variantId);
  const clearMutation = useClearDayRoutePlan(tripId, variantId);
  const pending = saveMutation.isPending || calculateMutation.isPending || clearMutation.isPending;

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
    updateDraft((current) => ({
      ...current,
      legModes: current.legModes.map((candidate, candidateIndex) =>
        candidateIndex === index ? mode : candidate,
      ),
    }));
  }

  function useHotelRoundTrip() {
    if (!previousHotel || !currentHotel) return;
    updateDraft((current) => {
      const withoutHotels = current.itemIds.filter(
        (itemId) => itemId !== previousHotel.id && itemId !== currentHotel.id,
      );
      const itemIds = [previousHotel.id, ...withoutHotels, currentHotel.id];
      return fixedDayRouteDraft(
        { itemIds, legModes: current.legModes },
        eligibleItems.map(({ id }) => id),
        suggestedMode,
        previousHotel.id,
        currentHotel.id,
      );
    });
  }

  async function saveAndCalculate() {
    if (!activeDay || !draft) return;
    const itemsById = new Map(stopItems.map((item) => [item.id, item]));
    const routeDraft: DayRouteDraft = {
      dayId: activeDay.id,
      legModes: draft.legModes,
      previousDayId: previousDay?.id,
      stops: draft.itemIds.map((itemId) => {
        const item = itemsById.get(itemId);
        return {
          coordinates: item?.place
            ? { latitude: item.place.latitude, longitude: item.place.longitude }
            : null,
          dayId: item?.day_id ?? "",
          itemId,
          tripId: item?.trip_id ?? "",
          type: item?.type ?? "deleted",
          variantId: item?.variant_id ?? "",
        };
      }),
      tripId,
      variantId: workspace.variant.id,
    };
    const validationError = validateDayRouteDraft(routeDraft);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(undefined);
    try {
      const saved = await saveMutation.mutateAsync({
        dayId: activeDay.id,
        itemIds: draft.itemIds,
        legModes: draft.legModes,
        tripId,
        variantId: workspace.variant.id,
      });
      await calculateMutation.mutateAsync({ planId: saved.id, tripId, variantId });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The day route could not be calculated.");
    }
  }

  async function clearRoute() {
    if (!activeDay || !plan) return;
    setError(undefined);
    try {
      await clearMutation.mutateAsync({
        dayId: activeDay.id,
        tripId,
        variantId: workspace.variant.id,
      });
      setDraft(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The day route could not be cleared.");
    }
  }

  const status = plan ? dayRouteStatus(workspace, plan) : undefined;
  const resolved = plan ? resolveRouteCalculationConfig(workspace, plan) : undefined;
  const calculatedFitKey = plan?.calculation?.computed_at;
  const defaultDraft = (): DayRouteEditorDraft => {
    const itemIds = eligibleItems.slice(0, 20).map(({ id }) => id);
    return {
      itemIds,
      legModes: Array.from({ length: Math.max(0, itemIds.length - 1) }, () => suggestedMode),
    };
  };

  return {
    activeDay,
    addStop,
    cancelEditing: () => {
      setDraft(null);
      setError(undefined);
    },
    clearRoute,
    draft,
    editing: draft !== null,
    eligibleItems,
    error: error ?? (!resolved?.config && plan ? resolved?.error : undefined),
    fitKey: calculatedFitKey ? `day-route:${activeDay?.id}:${calculatedFitKey}` : undefined,
    hotelTransferAvailable: Boolean(previousHotel && currentHotel),
    openCreate: () => {
      setDraft(defaultDraft());
      setError(undefined);
    },
    openEdit: () => {
      if (plan)
        setDraft(
          fixedDayRouteDraft(
            savedDraft(plan),
            eligibleItems.map(({ id }) => id),
            suggestedMode,
            previousHotel?.id,
            currentHotel?.id,
          ),
        );
      else setDraft(defaultDraft());
      setError(undefined);
    },
    pending,
    plan,
    previousDay,
    removeItem,
    removeStop,
    saveAndCalculate,
    setLegMode,
    status,
    stopItems,
    useHotelRoundTrip,
  };
}
