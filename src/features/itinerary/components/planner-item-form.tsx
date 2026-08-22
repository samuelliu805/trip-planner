"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ItemAttachmentsSection } from "@/features/attachments/components/item-attachments";
import { AttachmentSessionDiscardDialog } from "@/features/itinerary/components/attachment-session-discard-dialog";
import {
  PlannerEditorForm,
  type PlannerEditorSaveIntent,
} from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorHeader } from "@/features/itinerary/components/planner-editor-header";
import { PlannerItemExitDialog } from "@/features/itinerary/components/planner-item-exit-dialog";
import { itemCopy } from "@/features/itinerary/components/planner-item-form-config";
import {
  plannerItemFormSteps,
  plannerItemNeedsOrderStep,
  plannerItemStepError,
  type ItemFormStep,
} from "@/features/itinerary/components/planner-item-form-steps";
import { PlannerItemStepNav } from "@/features/itinerary/components/planner-item-step-nav";
import type { PlannerItemFormProps } from "@/features/itinerary/components/planner-item-form-types";
import { plannerItemSaveValues } from "@/features/itinerary/components/planner-item-save-values";
import { PlannerItemStepFields } from "@/features/itinerary/components/planner-item-step-fields";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";
import { usePlannerItemDraft } from "@/features/itinerary/components/use-planner-item-draft";
import { usePlannerItemFormState } from "@/features/itinerary/components/use-planner-item-form-state";
import { usePlannerItemStepSwipe } from "@/features/itinerary/components/use-planner-item-step-swipe";
import { itemOrderSlots } from "@/features/itinerary/activity-order";
import {
  useCreateItineraryItem,
  useUpdateItineraryItem,
} from "@/features/itinerary/item-mutations";
import { OPEN_SHARE_SETTINGS_EVENT } from "@/features/sharing/events";

const stepFieldSelector = "input:not([type='hidden']),textarea,[role='combobox']";

export function PlannerItemForm({
  dayDate,
  dayId,
  dayItems,
  defaultCurrency,
  item,
  onCancel,
  onCloseRequestRegistration,
  onCreateAnother,
  onError,
  onDraftChange,
  onSaved,
  shareAttachmentsEnabled,
  tripId,
  type,
  unavailableTransportModes = [],
  variantId,
}: PlannerItemFormProps) {
  const state = usePlannerItemFormState({
    dayDate,
    defaultCurrency,
    item,
    items: dayItems,
    type,
    unavailableTransportModes,
  });
  const createMutation = useCreateItineraryItem(tripId, variantId);
  const updateMutation = useUpdateItineraryItem(tripId, variantId);
  const titleRef = useRef<HTMLInputElement>(null);
  const itemMutationPending = createMutation.isPending || updateMutation.isPending;
  const attachmentSession = useAttachmentEditSession({
    item,
    itemMutationPending,
    onCancel,
    tripId,
  });
  const pending = itemMutationPending || attachmentSession.attachmentPending;
  const pendingLabel = attachmentSession.attachmentPending ? "Updating attachments…" : "Saving…";
  const mutationError = createMutation.error ?? updateMutation.error;
  const orderSlots = useMemo(() => itemOrderSlots(dayItems, item?.id), [dayItems, item?.id]);
  const includeOrder = plannerItemNeedsOrderStep({
    availableSlots: orderSlots.length,
    endTime: state.arrivalTime,
    startTime: state.startTime,
    type,
  });
  const canCreateAnother = !item && ["activity", "meal"].includes(type);
  const steps = useMemo(
    () =>
      plannerItemFormSteps({
        carAction: state.carAction,
        creating: !item,
        includeOrder,
        transportMode: state.transportMode,
        type,
      }),
    [includeOrder, item, state.carAction, state.transportMode, type],
  );
  const [stepId, setStepId] = useState<ItemFormStep["id"]>("basics");
  const [stepError, setStepError] = useState<string>();
  const [exitOpen, setExitOpen] = useState(false);
  const activeStep = steps.find(({ id }) => id === stepId) ?? steps[0];
  const stepIndex = steps.indexOf(activeStep);
  const { requestCancel } = attachmentSession;

  usePlannerItemDraft({
    arrivalTime: state.arrivalTime,
    dayId,
    item,
    links: state.links,
    notes: state.notes,
    onDraftChange,
    place: state.place,
    priceAmount: state.priceAmount,
    priceCurrency: state.priceCurrency,
    startTime: state.startTime,
    title: state.title,
    type,
  });

  const requestExit = useCallback(() => {
    if (itemMutationPending) return;
    if (state.dirty) {
      setExitOpen(true);
      return;
    }
    requestCancel();
  }, [itemMutationPending, requestCancel, state.dirty]);

  useEffect(() => {
    onCloseRequestRegistration?.(requestExit);
    return () => onCloseRequestRegistration?.(null);
  }, [onCloseRequestRegistration, requestExit]);

  function goToStep(nextStepId: ItemFormStep["id"]) {
    if (nextStepId === activeStep.id) return true;
    const blocking = plannerItemStepError({
      place: state.place,
      step: activeStep,
      title: state.title,
      type,
    });
    if (blocking) {
      setStepError(blocking);
      return false;
    }
    setStepError(undefined);
    setStepId(nextStepId);
    return true;
  }

  function moveStep(offset: number) {
    const next = steps[stepIndex + offset];
    if (next) return goToStep(next.id);
    return false;
  }

  const { gestureSurfaceRef, motionSurfaceRef } = usePlannerItemStepSwipe((offset) =>
    moveStep(offset),
  );
  const setGestureSurfaceNode = useCallback(
    (node: HTMLDivElement | null) => {
      gestureSurfaceRef.current = node;
    },
    [gestureSurfaceRef],
  );

  useEffect(() => {
    if (navigator.maxTouchPoints > 0) return;
    const frame = requestAnimationFrame(() => {
      if (
        activeStep.blocks.includes("place") &&
        !item &&
        ["activity", "location", "hotel", "meal"].includes(type)
      )
        return;
      const fallback = motionSurfaceRef.current?.querySelector<HTMLElement>(stepFieldSelector);
      (titleRef.current ?? fallback)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeStep, item, motionSurfaceRef, type]);

  async function save(intent: PlannerEditorSaveIntent) {
    const invalid = steps
      .map((step) => ({
        message: plannerItemStepError({ place: state.place, step, title: state.title, type }),
        step,
      }))
      .find(({ message }) => message);
    if (invalid?.message) {
      setStepId(invalid.step.id);
      setStepError(invalid.message);
      return;
    }
    setStepError(undefined);
    const values = plannerItemSaveValues({ item, state, tripId, type, variantId });
    if (pending || !values) return;
    try {
      const savedItem = item
        ? await updateMutation.mutateAsync({ ...values, id: item.id })
        : await createMutation.mutateAsync({ ...values, dayId });
      const committedItem = await attachmentSession.commit(savedItem);
      if (intent === "save-and-create-another" && canCreateAnother && onCreateAnother)
        onCreateAnother(committedItem);
      else onSaved(committedItem);
    } catch (mutationFailure) {
      onError(
        mutationFailure instanceof Error
          ? mutationFailure.message
          : "The itinerary item could not be saved.",
      );
    }
  }

  const copy = itemCopy[type];
  return (
    <PlannerEditorForm
      after={
        <>
          <AttachmentSessionDiscardDialog
            error={attachmentSession.error}
            onDiscard={attachmentSession.discard}
            onOpenChange={attachmentSession.setDiscardDialogOpen}
            open={attachmentSession.discardDialogOpen}
            pending={attachmentSession.discardPending}
            uploadPending={attachmentSession.attachmentPending}
          />
          <PlannerItemExitDialog
            editing={Boolean(item)}
            onDiscard={requestCancel}
            onOpenChange={setExitOpen}
            open={exitOpen}
          />
        </>
      }
      alternateSaveLabel={
        canCreateAnother && onCreateAnother
          ? `Save and add another ${copy.label.toLowerCase()}`
          : undefined
      }
      backDisabled={stepIndex === 0}
      fieldsRef={motionSurfaceRef}
      header={
        <PlannerEditorHeader
          closeDisabled={itemMutationPending}
          description={`Step ${stepIndex + 1} of ${steps.length}: ${activeStep.title}. The item can be saved from any step.`}
          error={stepError ?? mutationError?.message}
          navigation={
            <PlannerItemStepNav activeStepId={activeStep.id} onSelect={goToStep} steps={steps} />
          }
          onClose={requestExit}
          title={`${item ? "Edit" : "Add"} ${copy.label.toLowerCase()}`}
        />
      }
      nextDisabled={stepIndex === steps.length - 1}
      onBack={() => moveStep(-1)}
      onClose={requestExit}
      onNext={() => moveStep(1)}
      onSave={save}
      onScrollNode={setGestureSurfaceNode}
      pending={pending}
      pendingLabel={pendingLabel}
    >
      <PlannerItemStepFields
        attachments={
          <ItemAttachmentsSection
            item={item}
            onDraftCountChange={attachmentSession.setDraftCount}
            onOpenShareSettings={() => window.dispatchEvent(new Event(OPEN_SHARE_SETTINGS_EVENT))}
            onPendingChange={attachmentSession.setAttachmentPending}
            shareAttachmentsEnabled={shareAttachmentsEnabled}
            tripId={tripId}
            uploadSessionId={attachmentSession.uploadSessionId}
            uploadSessionSignal={attachmentSession.uploadSessionSignal}
          />
        }
        blocks={activeStep.blocks}
        dayItems={dayItems}
        dayId={dayId}
        defaultCurrency={defaultCurrency}
        item={item}
        onOrderChange={(nextItemId) => {
          state.setInsertAfterItemId(nextItemId);
          setStepError(undefined);
        }}
        pending={pending}
        state={state}
        titleRef={titleRef}
        type={type}
      />
    </PlannerEditorForm>
  );
}
