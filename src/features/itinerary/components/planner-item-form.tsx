"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ItemAttachmentsSection } from "@/features/attachments/components/item-attachments";
import {
  PlannerEditorForm,
  type PlannerEditorSaveIntent,
} from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorHeader } from "@/features/itinerary/components/planner-editor-header";
import { itemCopy } from "@/features/itinerary/components/planner-item-form-config";
import {
  plannerItemFormSteps,
  plannerItemNeedsOrderStep,
  plannerItemSaveAction,
  plannerItemStepError,
  type ItemFormStep,
} from "@/features/itinerary/components/planner-item-form-steps";
import { PlannerItemFormDialogs } from "@/features/itinerary/components/planner-item-form-dialogs";
import { PlannerItemStepNav } from "@/features/itinerary/components/planner-item-step-nav";
import type { PlannerItemFormProps } from "@/features/itinerary/components/planner-item-form-types";
import { plannerItemSaveValues } from "@/features/itinerary/components/planner-item-save-values";
import { PlannerItemStepFields } from "@/features/itinerary/components/planner-item-step-fields";
import { usePlannerItemDraft } from "@/features/itinerary/components/use-planner-item-draft";
import { usePlannerItemFormState } from "@/features/itinerary/components/use-planner-item-form-state";
import { usePlannerItemSaveFlow } from "@/features/itinerary/components/use-planner-item-save-flow";
import { usePlannerItemStepSwipe } from "@/features/itinerary/components/use-planner-item-step-swipe";
import { itemOrderSlots } from "@/features/itinerary/activity-order";
import { OPEN_SHARE_SETTINGS_EVENT } from "@/features/sharing/events";

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
  onSaveFeedback,
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
  const titleRef = useRef<HTMLInputElement>(null);
  const copy = itemCopy[type];
  const saveFlow = usePlannerItemSaveFlow({
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
  });
  const {
    attachmentSession,
    canCreateAnother,
    confirmSave,
    dismissSaveConfirmation,
    itemMutationPending,
    mutationError,
    pending,
    pendingLabel,
    requestSave,
    saveConfirmation,
  } = saveFlow;
  const orderSlots = useMemo(() => itemOrderSlots(dayItems, item?.id), [dayItems, item?.id]);
  const includeOrder = plannerItemNeedsOrderStep({
    availableSlots: orderSlots.length,
    endTime: state.arrivalTime,
    startTime: state.startTime,
    type,
  });
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
  const saveAction = plannerItemSaveAction({ activeStepId: activeStep.id, includeOrder });
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
      creating: !item,
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

  async function save(intent: PlannerEditorSaveIntent) {
    const invalid = steps
      .map((step) => ({
        message: plannerItemStepError({
          creating: !item,
          place: state.place,
          step,
          title: state.title,
          type,
        }),
        step,
      }))
      .find(({ message }) => message);
    if (invalid?.message) {
      setStepId(invalid.step.id);
      setStepError(invalid.message);
      return;
    }
    setStepError(undefined);
    if (saveAction === "confirm-order") {
      setStepId("order");
      return;
    }
    const values = plannerItemSaveValues({ item, state, tripId, type, variantId });
    if (pending || !values) return;
    await requestSave(intent, values);
  }

  return (
    <PlannerEditorForm
      after={
        <PlannerItemFormDialogs
          attachmentSession={attachmentSession}
          editing={Boolean(item)}
          exitOpen={exitOpen}
          itemLabel={copy.label}
          itemTitle={saveConfirmation?.values.title ?? copy.label}
          onExit={requestCancel}
          onExitOpenChange={setExitOpen}
          onSaveConfirm={confirmSave}
          onSaveConfirmationOpenChange={(open) => !open && dismissSaveConfirmation()}
          saveIntent={saveConfirmation?.intent ?? null}
        />
      }
      alternateSaveLabel={
        canCreateAnother && onCreateAnother && (!includeOrder || activeStep.id === "order")
          ? "Save & create new"
          : undefined
      }
      backDisabled={stepIndex === 0}
      fieldsRef={motionSurfaceRef}
      header={
        <PlannerEditorHeader
          closeDisabled={itemMutationPending}
          description={`Step ${stepIndex + 1} of ${steps.length}: ${activeStep.title}. ${
            includeOrder
              ? "Confirm the Order step before saving."
              : "The item can be saved from any step."
          }`}
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
      saveLabel={saveAction === "confirm-order" ? "Confirm order" : "Save"}
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
