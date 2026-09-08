"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { ItemAttachmentsSection } from "@/features/attachments/components/item-attachments";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import {
  PlannerEditorForm,
  type PlannerEditorSaveIntent,
} from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorHeader } from "@/features/itinerary/components/planner-editor-header";
import { itemCopy } from "@/features/itinerary/components/planner-item-form-config";
import {
  plannerItemFormError,
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
import { useItemEditorTelemetry } from "@/features/itinerary/components/use-item-editor-telemetry";
import {
  usePlannerItemConflictReload,
  type PlannerItemReloadResult,
} from "@/features/itinerary/components/use-planner-item-conflict-reload";
import { itemOrderSlots } from "@/features/itinerary/activity-order";
import { OPEN_SHARE_SETTINGS_EVENT } from "@/features/sharing/events";
import type { ItemEditorCloseReason } from "@/lib/telemetry/events";
import { isItineraryConflict } from "@/features/itinerary/query-cache";

export function PlannerItemForm(props: PlannerItemFormProps) {
  const reload = usePlannerItemConflictReload(props);

  return (
    <PlannerItemFormInner
      {...props}
      dayItems={reload.currentDayItems ?? props.dayItems}
      item={reload.currentItem}
      key={`${reload.currentItem?.id ?? "new"}:${reload.currentItem?.version ?? 1}:${reload.revision}`}
      onReloadLatest={reload.reloadLatest}
      reloadError={reload.reloadError}
    />
  );
}

function PlannerItemFormInner({
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
  onReloadLatest,
  reloadError,
}: PlannerItemFormProps & {
  onReloadLatest: () => Promise<PlannerItemReloadResult | undefined>;
  reloadError?: string;
}) {
  const { t } = useI18n();
  // Keep the Order preview on the items that existed when this editor opened. An optimistic create
  // must not appear both as the moving item and as a newly-placeable row before the editor closes.
  const [orderPreviewItems, setOrderPreviewItems] = useState(() => dayItems);
  const [baseVersion, setBaseVersion] = useState(item?.version);
  const [reloadPending, setReloadPending] = useState(false);
  const state = usePlannerItemFormState({
    dayDate,
    defaultCurrency,
    item,
    items: orderPreviewItems,
    type,
    unavailableTransportModes,
  });
  const titleRef = useRef<HTMLInputElement>(null);
  const copy = itemCopy[type];
  const { closeEditor, onCreatedAnother, onItemSaved, setCloseReason } = useItemEditorTelemetry({
    dirty: state.dirty,
    item,
    onCancel,
    onCreateAnother,
    onSaved,
    type,
  });
  const saveFlow = usePlannerItemSaveFlow({
    dayId,
    item,
    expectedVersion: baseVersion,
    onCancel: closeEditor,
    onCreateAnother: onCreateAnother ? onCreatedAnother : undefined,
    onError,
    onSaveFeedback,
    onSaved: onItemSaved,
    tripId,
    type,
    variantId,
  });
  const {
    attachmentSession,
    canCreateAnother,
    itemMutationPending,
    mutationError,
    pending,
    pendingLabel,
    requestSave,
    resetMutationErrors,
  } = saveFlow;

  async function loadLatest() {
    setReloadPending(true);
    const latest = await onReloadLatest();
    setReloadPending(false);
    if (!latest) return;
    setOrderPreviewItems(latest.items);
    if (latest.item) setBaseVersion(latest.item.version);
    resetMutationErrors();
  }
  const orderSlots = useMemo(
    () => itemOrderSlots(orderPreviewItems, item?.id),
    [item?.id, orderPreviewItems],
  );
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
  const saveAction = plannerItemSaveAction({
    activeStepId: activeStep.id,
    creating: !item,
    includeOrder,
  });
  const formError = plannerItemFormError({
    creating: !item,
    place: state.place,
    steps,
    title: state.title,
    type,
  });
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
  const requestExit = useCallback(
    (reason: ItemEditorCloseReason = "cancel") => {
      if (itemMutationPending) return;
      setCloseReason(reason);
      if (state.dirty) {
        setExitOpen(true);
        return;
      }
      requestCancel();
    },
    [itemMutationPending, requestCancel, setCloseReason, state.dirty],
  );
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
    if (formError) {
      setStepId(formError.step.id);
      setStepError(formError.message);
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
          onExit={requestCancel}
          onExitOpenChange={setExitOpen}
        />
      }
      alternateSaveLabel={
        canCreateAnother && onCreateAnother && (!includeOrder || activeStep.id === "order")
          ? "Save & create new"
          : undefined
      }
      backDisabled={stepIndex === 0}
      fieldsRef={motionSurfaceRef}
      footer={
        isItineraryConflict(mutationError) ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm text-muted-foreground">
              <T
                message={
                  item
                    ? "Reloading replaces only this item and keeps the editor open."
                    : "Reload the latest day and keep this draft open."
                }
              />
            </p>
            <div className="mt-2 flex min-w-0 flex-wrap gap-2">
              <Button
                className="min-h-11"
                disabled={reloadPending}
                onClick={() => void loadLatest()}
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                <T message={reloadPending ? "Loading…" : "Reload latest"} />
              </Button>
            </div>
          </div>
        ) : undefined
      }
      header={
        <PlannerEditorHeader
          closeDisabled={itemMutationPending}
          description={`${t("Step {current} of {total}: {step}.", {
            current: stepIndex + 1,
            step: t(activeStep.title),
            total: steps.length,
          })} ${t(
            !item && includeOrder
              ? "Confirm the Order step before saving."
              : "The item can be saved from any step.",
          )}`}
          error={reloadError ?? stepError ?? mutationError?.message}
          navigation={
            <PlannerItemStepNav activeStepId={activeStep.id} onSelect={goToStep} steps={steps} />
          }
          onClose={() => requestExit("close_button")}
          title={t(item ? "Edit {item}" : "Add {item}", { item: t(copy.label) })}
        />
      }
      nextDisabled={stepIndex === steps.length - 1}
      onBack={() => moveStep(-1)}
      onClose={() => requestExit("escape")}
      onNext={() => moveStep(1)}
      onSave={save}
      onScrollNode={setGestureSurfaceNode}
      pending={pending}
      pendingLabel={pendingLabel}
      saveDisabled={Boolean(formError)}
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
        dayItems={orderPreviewItems}
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
