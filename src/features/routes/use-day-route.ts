"use client";

import { useMemo, useState } from "react";

import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "@/features/itinerary/types";

import { eligibleDayRouteItems } from "./day-route-map";
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
  moveStop: (index: number, direction: -1 | 1) => void;
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
      const repeatedHotel =
        current.itemIds.length >= 2 &&
        current.itemIds[0] === current.itemIds.at(-1) &&
        eligibleItems.find(({ id }) => id === current.itemIds[0])?.type === "hotel";
      const hotelTransfer =
        current.itemIds[0] === previousHotel?.id && current.itemIds.at(-1) === currentHotel?.id;
      const insertAt =
        repeatedHotel || hotelTransfer ? current.itemIds.length - 1 : current.itemIds.length;
      const itemIds = [...current.itemIds];
      itemIds.splice(insertAt, 0, itemId);
      const legModes = [...current.legModes];
      if (itemIds.length > 1)
        legModes.splice(Math.min(insertAt, legModes.length), 0, suggestedMode);
      return { itemIds, legModes };
    });
  }

  function removeStop(index: number) {
    updateDraft((current) => {
      if (!current.itemIds[index]) return current;
      const itemIds = current.itemIds.filter((_, candidate) => candidate !== index);
      const legModes = [...current.legModes];
      if (legModes.length) legModes.splice(Math.min(index, legModes.length - 1), 1);
      return { itemIds, legModes };
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
        const itemIds = next.itemIds.filter((_, candidate) => candidate !== index);
        const legModes = [...next.legModes];
        if (legModes.length) legModes.splice(Math.min(index, legModes.length - 1), 1);
        next = { itemIds, legModes };
      }
      return next;
    });
  }

  function moveStop(index: number, direction: -1 | 1) {
    updateDraft((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.itemIds.length) return current;
      if (current.itemIds[0] === previousHotel?.id && (index === 0 || destination === 0))
        return current;
      const itemIds = [...current.itemIds];
      [itemIds[index], itemIds[destination]] = [itemIds[destination], itemIds[index]];
      return { ...current, itemIds };
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
      return {
        itemIds,
        legModes: Array.from({ length: Math.max(0, itemIds.length - 1) }, (_, index) =>
          index < current.legModes.length ? current.legModes[index] : suggestedMode,
        ),
      };
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
    moveStop,
    openCreate: () => {
      setDraft({ itemIds: [], legModes: [] });
      setError(undefined);
    },
    openEdit: () => {
      if (plan) setDraft(savedDraft(plan));
      else setDraft({ itemIds: [], legModes: [] });
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
