"use client";

import { useState } from "react";

import type { PlannerEditorSaveIntent } from "@/features/itinerary/components/planner-editor-form";
import {
  itemCopy,
  plannerItemCreationNeedsConfirmation,
} from "@/features/itinerary/components/planner-item-form-config";
import type { PlannerItemFormProps } from "@/features/itinerary/components/planner-item-form-types";
import { plannerItemSaveValues } from "@/features/itinerary/components/planner-item-save-values";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";
import {
  useCreateItineraryItem,
  useUpdateItineraryItem,
} from "@/features/itinerary/item-mutations";

type ItemSaveValues = NonNullable<ReturnType<typeof plannerItemSaveValues>>;

export function usePlannerItemSaveFlow({
  dayId,
  item,
  onCancel,
  onCreateAnother,
  onError,
  onSaveFeedback,
  onSaved,
  tripId,
  type,
  variantId,
}: Pick<
  PlannerItemFormProps,
  | "dayId"
  | "item"
  | "onCancel"
  | "onCreateAnother"
  | "onError"
  | "onSaveFeedback"
  | "onSaved"
  | "tripId"
  | "type"
  | "variantId"
>) {
  const createMutation = useCreateItineraryItem(tripId, variantId);
  const updateMutation = useUpdateItineraryItem(tripId, variantId);
  const itemMutationPending = createMutation.isPending || updateMutation.isPending;
  const attachmentSession = useAttachmentEditSession({
    item,
    itemMutationPending,
    onCancel,
    tripId,
  });
  const pending = itemMutationPending || attachmentSession.attachmentPending;
  const canCreateAnother = !item && ["activity", "meal"].includes(type);
  const creationNeedsConfirmation = !item && plannerItemCreationNeedsConfirmation(type);
  const [saveConfirmation, setSaveConfirmation] = useState<{
    intent: PlannerEditorSaveIntent;
    values: ItemSaveValues;
  } | null>(null);

  async function persistSave(intent: PlannerEditorSaveIntent, values: ItemSaveValues) {
    if (pending) return;
    try {
      const savedItem = item
        ? await updateMutation.mutateAsync({ ...values, id: item.id })
        : await createMutation.mutateAsync({ ...values, dayId });
      const committedItem = await attachmentSession.commit(savedItem);
      if (creationNeedsConfirmation)
        onSaveFeedback({
          item: committedItem,
          itemLabel: itemCopy[type].label,
          showViewLink: intent === "save-and-create-another",
          status: "created",
        });
      if (intent === "save-and-create-another" && canCreateAnother && onCreateAnother)
        onCreateAnother(committedItem);
      else onSaved(committedItem);
    } catch (mutationFailure) {
      const message =
        mutationFailure instanceof Error
          ? mutationFailure.message
          : "The itinerary item could not be saved.";
      if (creationNeedsConfirmation)
        onSaveFeedback({
          itemLabel: itemCopy[type].label,
          itemTitle: values.title,
          message,
          status: "error",
        });
      onError(message);
    }
  }

  async function requestSave(intent: PlannerEditorSaveIntent, values: ItemSaveValues) {
    if (pending) return;
    if (creationNeedsConfirmation) {
      onSaveFeedback(undefined);
      setSaveConfirmation({ intent, values });
      return;
    }
    await persistSave(intent, values);
  }

  function confirmSave() {
    const confirmed = saveConfirmation;
    setSaveConfirmation(null);
    if (confirmed) void persistSave(confirmed.intent, confirmed.values);
  }

  return {
    attachmentSession,
    canCreateAnother,
    confirmSave,
    dismissSaveConfirmation: () => setSaveConfirmation(null),
    itemMutationPending,
    mutationError: createMutation.error ?? updateMutation.error,
    pending,
    pendingLabel: attachmentSession.attachmentPending ? "Updating attachments…" : "Saving…",
    requestSave,
    saveConfirmation,
  };
}
