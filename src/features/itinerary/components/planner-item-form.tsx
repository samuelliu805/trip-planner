"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ItemAttachmentsSection } from "@/features/attachments/components/item-attachments";
import { AttachmentSessionDiscardDialog } from "@/features/itinerary/components/attachment-session-discard-dialog";
import { PlannerItemExitDialog } from "@/features/itinerary/components/planner-item-exit-dialog";
import { PlannerItemFormActions } from "@/features/itinerary/components/planner-item-form-actions";
import { itemCopy } from "@/features/itinerary/components/planner-item-form-config";
import {
  plannerItemFormSteps,
  plannerItemStepError,
  type ItemFormStep,
} from "@/features/itinerary/components/planner-item-form-steps";
import type { PlannerItemFormProps } from "@/features/itinerary/components/planner-item-form-types";
import { plannerItemSaveValues } from "@/features/itinerary/components/planner-item-save-values";
import { PlannerItemStepFields } from "@/features/itinerary/components/planner-item-step-fields";
import { PlannerItemStepNav } from "@/features/itinerary/components/planner-item-step-nav";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";
import { usePlannerItemDraft } from "@/features/itinerary/components/use-planner-item-draft";
import { usePlannerItemFormState } from "@/features/itinerary/components/use-planner-item-form-state";
import {
  useCreateItineraryItem,
  useDeleteItineraryItem,
  useUpdateItineraryItem,
} from "@/features/itinerary/item-mutations";
import { OPEN_SHARE_SETTINGS_EVENT } from "@/features/sharing/events";

const stepFieldSelector = "input:not([type='hidden']),textarea,[role='combobox']";

export function PlannerItemForm({
  dayId,
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
  const state = usePlannerItemFormState({ defaultCurrency, item, unavailableTransportModes });
  const createMutation = useCreateItineraryItem(tripId, variantId);
  const updateMutation = useUpdateItineraryItem(tripId, variantId);
  const deleteMutation = useDeleteItineraryItem(tripId, variantId);
  const titleRef = useRef<HTMLInputElement>(null);
  const stepBodyRef = useRef<HTMLDivElement>(null);
  const itemMutationPending =
    createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const attachmentSession = useAttachmentEditSession({
    item,
    itemMutationPending,
    onCancel,
    tripId,
  });
  const pending = itemMutationPending || attachmentSession.attachmentPending;
  const mutationError = createMutation.error ?? updateMutation.error ?? deleteMutation.error;
  const steps = useMemo(
    () =>
      plannerItemFormSteps({
        carAction: state.carAction,
        transportMode: state.transportMode,
        type,
      }),
    [state.carAction, state.transportMode, type],
  );
  const [stepId, setStepId] = useState<ItemFormStep["id"]>("basics");
  const [stepError, setStepError] = useState<string>();
  const [exitOpen, setExitOpen] = useState(false);
  const activeStep = steps.find(({ id }) => id === stepId) ?? steps[0];
  const stepIndex = steps.indexOf(activeStep);
  const { requestCancel } = attachmentSession;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (activeStep.blocks.includes("place") && !item && ["location", "hotel"].includes(type))
        return;
      const fallback = stepBodyRef.current?.querySelector<HTMLElement>(stepFieldSelector);
      (titleRef.current ?? fallback)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeStep, item, type]);

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
    if (nextStepId === activeStep.id) return;
    const blocking = plannerItemStepError({
      place: state.place,
      step: activeStep,
      title: state.title,
      type,
    });
    if (blocking) {
      setStepError(blocking);
      return;
    }
    setStepError(undefined);
    setStepId(nextStepId);
  }

  function moveStep(offset: number) {
    const next = steps[stepIndex + offset];
    if (next) goToStep(next.id);
  }

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
    setStepError(undefined);
    const values = plannerItemSaveValues({ item, state, tripId, type, variantId });
    if (pending || !values) return;
    try {
      const savedItem = item
        ? await updateMutation.mutateAsync({ ...values, id: item.id })
        : await createMutation.mutateAsync({ ...values, dayId });
      onSaved(await attachmentSession.commit(savedItem), {
        place: activeStep.blocks.includes("placement"),
      });
    } catch (mutationFailure) {
      onError(
        mutationFailure instanceof Error
          ? mutationFailure.message
          : "The itinerary item could not be saved.",
      );
    }
  }

  async function remove() {
    if (!item) return;
    try {
      await deleteMutation.mutateAsync({ id: item.id, tripId, variantId });
      attachmentSession.markHandled();
      onCancel();
    } catch {
      // TanStack Query exposes the mutation error in the form below.
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
      <div className="shrink-0 space-y-3 border-b px-5 py-4 pr-16 sm:px-6">
        <DialogTitle className="truncate text-base font-semibold">
          {item ? "Edit" : "Add"} {copy.label.toLowerCase()}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Step {stepIndex + 1} of {steps.length}: {activeStep.title}. The item can be saved from any
          step.
        </DialogDescription>
        <PlannerItemStepNav activeStepId={activeStep.id} onSelect={goToStep} steps={steps} />
      </div>
      <div
        className="min-h-0 min-w-0 flex-1 touch-pan-y space-y-4 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4 sm:px-6"
        data-planner-editor-scroll=""
        ref={stepBodyRef}
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
          dayId={dayId}
          defaultCurrency={defaultCurrency}
          item={item}
          pending={pending}
          state={state}
          titleRef={titleRef}
          type={type}
        />
      </div>
      <PlannerItemFormActions
        error={stepError ?? mutationError?.message}
        item={item}
        lastStep={stepIndex === steps.length - 1}
        onBack={() => moveStep(-1)}
        onNext={() => moveStep(1)}
        onRemove={remove}
        pending={pending}
        pendingLabel={attachmentSession.attachmentPending ? "Updating attachments…" : undefined}
        primaryLabel={
          activeStep.blocks.includes("placement")
            ? "Place item"
            : item
              ? "Save changes"
              : "Add item"
        }
        showBack={stepIndex > 0}
      />
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
