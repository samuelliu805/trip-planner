"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { useDraftAutosave } from "@/features/editing/use-draft-autosave";
import { useUpdateItineraryItem } from "../item-mutations";
import { plannerQueryKey } from "../planner-query";
import type { ItineraryItem, PlannerWorkspace } from "../types";
import { plannerItemSaveValues } from "./planner-item-save-values";
import { usePlannerItemFormState } from "./use-planner-item-form-state";

/** Uses the same draft slot and save values as the complex editor. */
export function PlannerInlineFields({
  item,
  onClose,
}: {
  item: ItineraryItem;
  onClose: () => void;
}) {
  const { t } = useI18n(),
    client = useQueryClient();
  const workspace = client.getQueryData<PlannerWorkspace>(
    plannerQueryKey(item.trip_id, item.variant_id),
  );
  const day = workspace?.days.find((day) => day.id === item.day_id);
  const state = usePlannerItemFormState({
    item,
    dayId: item.day_id,
    dayDate: day?.date ?? "",
    items: day?.items ?? [item],
    tripId: item.trip_id,
    variantId: item.variant_id,
    type: item.type,
    defaultCurrency: item.price_currency ?? "USD",
    unavailableTransportModes: [],
  });
  const mutation = useUpdateItineraryItem(item.trip_id, item.variant_id);
  const [error, setError] = useState<string>();
  const last = useRef<string | undefined>(undefined);
  const version = useRef(item.version);
  async function save() {
    if (!state.localDraft.hasChanges() || !state.localDraft.persist()) return;
    try {
      const live = { ...state, ...state.localDraft.getValues() };
      const values = plannerItemSaveValues({
        item,
        state: live,
        tripId: item.trip_id,
        variantId: item.variant_id,
        type: item.type,
      });
      const snapshot = JSON.stringify(state.localDraft.getValues());
      if (!values || !values.title?.trim()) return;
      const signature = JSON.stringify(values);
      if (signature === last.current) return;
      const confirmed = client.getQueryData<PlannerWorkspace>(
        plannerQueryKey(item.trip_id, item.variant_id),
      );
      const expectedItemsVersion = confirmed?.days.find(
        (day) => day.id === item.day_id,
      )?.items_version;
      if (!expectedItemsVersion)
        throw new Error("This day's version is unavailable. Your draft is kept.");
      last.current = signature;
      const saved = await mutation.mutateAsync({
        ...values,
        id: item.id,
        dayId: item.day_id,
        expectedItemsVersion,
        expectedVersion: version.current,
        operationId: crypto.randomUUID(),
        surface: "planner",
      });
      version.current = saved.version;
      setError(undefined);
      state.localDraft.discardIfMatches(snapshot);
    } catch (failure) {
      last.current = undefined;
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  const autosave = useDraftAutosave(state.dirty, JSON.stringify(state.localDraft.values), save);
  return (
    <div
      className="col-span-full space-y-2 rounded border bg-background p-2"
      data-inline-editor={item.id}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          autosave.flush();
          onClose();
        }
      }}
      onCompositionStart={() => autosave.composition(true)}
      onCompositionEnd={() => autosave.composition(false)}
    >
      <Input
        aria-label={t("Name")}
        value={state.title}
        onChange={(event) => state.setTitle(event.target.value)}
      />
      <Input
        aria-label={t("Time")}
        type="time"
        value={state.startTime}
        onChange={(event) => state.setStartTime(event.target.value)}
      />
      <Input
        aria-label={t("Price")}
        inputMode="decimal"
        value={state.priceAmount}
        onChange={(event) => state.setPriceAmount(event.target.value)}
      />
      <Textarea
        aria-label={t("Notes")}
        value={state.notes}
        onChange={(event) => state.setNotes(event.target.value)}
      />
      {error || state.localDraft.error ? (
        <p role="alert">{state.localDraft.error ?? error}</p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => {
          autosave.flush();
          onClose();
        }}
      >
        <T message="Close editor" />
      </Button>
      {state.localDraft.error ? (
        <Button type="button" onClick={state.localDraft.download}>
          <T message="Download draft" />
        </Button>
      ) : null}
    </div>
  );
}
