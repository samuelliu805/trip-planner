"use client";

import { useQueryClient } from "@tanstack/react-query";

import type { PlannerEditorSaveIntent } from "@/features/itinerary/components/planner-editor-form";
import {
  itemCopy,
  plannerItemCreationReportsFeedback,
} from "@/features/itinerary/components/planner-item-form-config";
import type { PlannerItemFormProps } from "@/features/itinerary/components/planner-item-form-types";
import { plannerItemSaveValues } from "@/features/itinerary/components/planner-item-save-values";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";
import {
  useCreateItineraryItem,
  useUpdateItineraryItem,
} from "@/features/itinerary/item-mutations";
import { plannerQueryKey } from "@/features/itinerary/planner-query";
import { replaceItem } from "@/features/itinerary/query-cache";
import type { PlannerWorkspace } from "@/features/itinerary/types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

type ItemSaveValues = NonNullable<ReturnType<typeof plannerItemSaveValues>>;

export function usePlannerItemSaveFlow({
  dayId,
  item,
  expectedVersion,
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
> & { expectedVersion?: number }) {
  const client = useQueryClient();
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
  const reportsCreationFeedback = !item && plannerItemCreationReportsFeedback(type);

  async function persistSave(intent: PlannerEditorSaveIntent, values: ItemSaveValues) {
    if (pending) return;
    try {
      const workspace = client.getQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId));
      const targetDayId = item?.day_id ?? dayId;
      const expectedItemsVersion = workspace?.days.find(
        ({ id }) => id === targetDayId,
      )?.items_version;
      if (!expectedItemsVersion)
        throw new Error("Reload this day before saving; its collaboration version is unavailable.");
      const operationId = newTelemetryOperationId();
      const savedItem = item
        ? await updateMutation.mutateAsync({
            ...values,
            dayId: targetDayId,
            expectedItemsVersion,
            expectedVersion: expectedVersion ?? item.version,
            id: item.id,
            operationId,
            surface: "item_editor",
            uploadSessionId: attachmentSession.uploadSessionId,
          })
        : await createMutation.mutateAsync({
            ...values,
            dayId,
            expectedItemsVersion,
            operationId,
            surface: "item_editor",
            uploadSessionId: attachmentSession.uploadSessionId,
          });
      attachmentSession.markHandled();
      const committedItem = savedItem;
      client.setQueryData<PlannerWorkspace>(plannerQueryKey(tripId, variantId), (current) =>
        replaceItem(current, committedItem),
      );
      if (reportsCreationFeedback)
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
      if (reportsCreationFeedback)
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
    if (reportsCreationFeedback) onSaveFeedback(undefined);
    await persistSave(intent, values);
  }

  return {
    attachmentSession,
    canCreateAnother,
    itemMutationPending,
    mutationError: createMutation.error ?? updateMutation.error,
    pending,
    pendingLabel: attachmentSession.attachmentPending ? "Updating attachments…" : "Saving…",
    requestSave,
    resetMutationErrors() {
      createMutation.reset();
      updateMutation.reset();
    },
  };
}
