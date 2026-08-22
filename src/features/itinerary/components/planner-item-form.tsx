"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ItemAttachmentsSection } from "@/features/attachments/components/item-attachments";
import { AttachmentSessionDiscardDialog } from "@/features/itinerary/components/attachment-session-discard-dialog";
import { PlannerItemExitDialog } from "@/features/itinerary/components/planner-item-exit-dialog";
import { PlannerEditorPage } from "@/features/itinerary/components/planner-editor-screen";
import { PlannerItemFormActions } from "@/features/itinerary/components/planner-item-form-actions";
import { itemCopy } from "@/features/itinerary/components/planner-item-form-config";
import { PlannerItemFormHeader } from "@/features/itinerary/components/planner-item-form-header";
import {
  plannerItemFormSteps,
  plannerItemStepError,
  type ItemFormStep,
} from "@/features/itinerary/components/planner-item-form-steps";
import type { PlannerItemFormProps } from "@/features/itinerary/components/planner-item-form-types";
import { plannerItemSaveValues } from "@/features/itinerary/components/planner-item-save-values";
import { PlannerItemStepFields } from "@/features/itinerary/components/planner-item-step-fields";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";
import { usePlannerItemDraft } from "@/features/itinerary/components/use-planner-item-draft";
import { usePlannerItemFormState } from "@/features/itinerary/components/use-planner-item-form-state";
import { usePlannerItemStepSwipe } from "@/features/itinerary/components/use-planner-item-step-swipe";
import { usePlannerEditorKeyboardScroll } from "@/features/itinerary/components/use-planner-editor-keyboard-scroll";
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
  const supportsManualOrder = ["activity", "car_rental", "meal"].includes(type);
  const [orderRequested, setOrderRequested] = useState(
    Boolean(item && supportsManualOrder && !item.start_time && !item.end_time),
  );
  const [orderConfirmed, setOrderConfirmed] = useState(Boolean(item));
  const manualOrderNeeded = supportsManualOrder && !state.startTime && !state.arrivalTime;
  const includeOrder = manualOrderNeeded && (Boolean(item) || orderRequested);
  const steps = useMemo(
    () =>
      plannerItemFormSteps({
        carAction: state.carAction,
        includeOrder,
        transportMode: state.transportMode,
        type,
      }),
    [includeOrder, state.carAction, state.transportMode, type],
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
    if (offset > 0 && manualOrderNeeded && !includeOrder) {
      setOrderRequested(true);
      return goToStep("order");
    }
    return false;
  }

  const { gestureSurfaceRef, motionSurfaceRef } = usePlannerItemStepSwipe((offset) =>
    moveStep(offset),
  );
  const editorScrollRef = usePlannerEditorKeyboardScroll();
  const setEditorScrollNode = useCallback(
    (node: HTMLDivElement | null) => {
      editorScrollRef.current = node;
      gestureSurfaceRef.current = node;
    },
    [editorScrollRef, gestureSurfaceRef],
  );

  useEffect(() => {
    if (navigator.maxTouchPoints > 0) return;
    const frame = requestAnimationFrame(() => {
      if (
        activeStep.blocks.includes("place") &&
        !item &&
        ["location", "hotel", "meal"].includes(type)
      )
        return;
      const fallback = motionSurfaceRef.current?.querySelector<HTMLElement>(stepFieldSelector);
      (titleRef.current ?? fallback)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeStep, item, motionSurfaceRef, type]);

  async function save() {
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
    if (manualOrderNeeded && !orderConfirmed) {
      if (includeOrder && activeStep.id === "order") {
        setStepError("Choose this item’s position before saving.");
      } else {
        setOrderRequested(true);
        setStepId("order");
        setStepError(undefined);
      }
      return;
    }
    setStepError(undefined);
    const values = plannerItemSaveValues({ item, state, tripId, type, variantId });
    if (pending || !values) return;
    try {
      const savedItem = item
        ? await updateMutation.mutateAsync({ ...values, id: item.id })
        : await createMutation.mutateAsync({ ...values, dayId });
      onSaved(await attachmentSession.commit(savedItem));
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
    <form
      className="planner-item-form flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      onKeyDown={(event) => {
        if ((event.target as Element).closest("[data-attachment-overlay]")) return;
        if (event.key === "Escape") {
          event.preventDefault();
          requestExit();
          return;
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void save();
          return;
        }
        if (!event.altKey) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveStep(1);
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveStep(-1);
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <PlannerEditorPage
        headerScrolls
        header={
          <PlannerItemFormHeader
            activeStep={activeStep}
            closeDisabled={itemMutationPending}
            editing={Boolean(item)}
            error={stepError ?? mutationError?.message}
            label={copy.label}
            onClose={requestExit}
            onStepSelect={goToStep}
            stepIndex={stepIndex}
            steps={steps}
          />
        }
        scrollRef={setEditorScrollNode}
      >
        <div className="planner-item-form-content px-5 py-8 sm:px-6 sm:py-10">
          <div className="planner-item-form-card">
            <div className="planner-item-form-fields" ref={motionSurfaceRef}>
              <PlannerItemStepFields
                attachments={
                  <ItemAttachmentsSection
                    item={item}
                    onDraftCountChange={attachmentSession.setDraftCount}
                    onOpenShareSettings={() =>
                      window.dispatchEvent(new Event(OPEN_SHARE_SETTINGS_EVENT))
                    }
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
                  setOrderConfirmed(true);
                  setStepError(undefined);
                }}
                orderConfirmed={orderConfirmed}
                pending={pending}
                state={state}
                titleRef={titleRef}
                type={type}
              />
            </div>
            <PlannerItemFormActions
              firstStep={stepIndex === 0}
              lastStep={stepIndex === steps.length - 1 && !(manualOrderNeeded && !includeOrder)}
              onBack={() => moveStep(-1)}
              onNext={() => moveStep(1)}
              pending={pending}
              pendingLabel={pendingLabel}
            />
          </div>
        </div>
      </PlannerEditorPage>
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
    </form>
  );
}
