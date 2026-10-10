"use client";
import { useCallback, useEffect, useRef } from "react";
import { plannerItemFormError, type ItemFormStep } from "./planner-item-form-steps";
import { plannerItemSaveValues } from "./planner-item-save-values";
import type { PlannerItemFormState } from "./use-planner-item-form-state";
import type { ItineraryItem, ItineraryItemType } from "../types";

export function usePlannerItemAutosave({
  item,
  state,
  steps,
  tripId,
  type,
  variantId,
  save,
}: {
  item?: ItineraryItem;
  state: PlannerItemFormState;
  steps: ItemFormStep[];
  tripId: string;
  type: ItineraryItemType;
  variantId: string;
  save: (
    values: NonNullable<ReturnType<typeof plannerItemSaveValues>>,
  ) => Promise<ItineraryItem | undefined>;
}) {
  const composing = useRef(false),
    submit = useRef<() => void>(() => {}),
    lastAccepted = useRef<string | undefined>(undefined);
  useEffect(() => {
    submit.current = () => {
      const live = { ...state, ...state.localDraft.getValues() };
      const invalid = plannerItemFormError({
        creating: !item,
        place: live.place,
        steps,
        title: live.title,
        type,
      });
      if (
        !item ||
        !state.localDraft.hasChanges() ||
        composing.current ||
        live.placeQuery.trim() ||
        invalid ||
        state.localDraft.getError()
      )
        return;
      try {
        const values = plannerItemSaveValues({ item, state: live, tripId, type, variantId });
        if (!values) return;
        const signature = JSON.stringify(values);
        const draftSnapshot = JSON.stringify(state.localDraft.getValues());
        if (signature === lastAccepted.current) return;
        lastAccepted.current = signature;
        void save(values).then((saved) => {
          if (!saved) lastAccepted.current = undefined;
          else state.localDraft.discardIfMatches(draftSnapshot);
        });
      } catch {
        /* Incomplete prices/links remain a recoverable local draft. */
      }
    };
  });
  const flush = useCallback(() => submit.current(), []);
  const signature = JSON.stringify(state.localDraft.values);
  useEffect(() => {
    if (!item || !state.dirty) return;
    const timer = window.setTimeout(flush, 500);
    return () => window.clearTimeout(timer);
  }, [signature, flush, item, state.dirty]);
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
  return {
    flush,
    composition: (value: boolean) => {
      composing.current = value;
      if (!value) window.setTimeout(flush, 0);
    },
  };
}
