"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ResearchAttachments } from "@/features/attachments/components/research-attachments";
import { useI18n } from "@/features/i18n/i18n-provider";
import { AttachmentSessionDiscardDialog } from "@/features/itinerary/components/attachment-session-discard-dialog";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorHeader } from "@/features/itinerary/components/planner-editor-header";
import { PlannerItemExitDialog } from "@/features/itinerary/components/planner-item-exit-dialog";
import { PlannerItemStepNav } from "@/features/itinerary/components/planner-item-step-nav";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";

import { ResearchItemFields } from "./research-item-fields";
import { createResearchItem, updateResearchItem } from "../actions";
import { researchDraftCanSave, researchItemInputFromForm } from "../research-item-form-values";
import {
  researchItemFormSteps,
  researchItemStepDescription,
  type ResearchItemFormStep,
} from "../research-item-form-steps";
import { researchCategorySingularLabels, type ResearchCategory, type ResearchItem } from "../types";

export function ResearchItemForm({
  category,
  context,
  defaultCurrency,
  item,
  onCancel,
  onCloseRequestRegistration,
  onSaved,
  tripId,
}: {
  category: ResearchCategory;
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  item?: ResearchItem;
  onCancel: () => void;
  onCloseRequestRegistration: (handler: (() => void) | null) => void;
  onSaved: (item: ResearchItem) => void;
  tripId: string;
}) {
  const { t } = useI18n();
  const steps = researchItemFormSteps(category);
  const [stepId, setStepId] = useState<ResearchItemFormStep["id"]>("primary");
  const [mutationPending, setMutationPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [canSave, setCanSave] = useState(Boolean(item));
  const [error, setError] = useState<string>();
  const [exitOpen, setExitOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);
  const label = researchCategorySingularLabels[category];
  const activeIndex = steps.findIndex(({ id }) => id === stepId);
  const attachmentSession = useAttachmentEditSession({
    item,
    itemMutationPending: mutationPending,
    onCancel,
    targetKind: "research",
    tripId,
  });
  const {
    attachmentPending,
    commit: commitAttachments,
    discard: discardAttachments,
    discardDialogOpen,
    discardPending,
    error: attachmentError,
    requestCancel,
    setAttachmentPending,
    setDiscardDialogOpen,
    setDraftCount,
    uploadSessionId,
    uploadSessionSignal,
  } = attachmentSession;
  const pending = mutationPending || attachmentPending;

  const requestExit = useCallback(() => {
    if (pending) return;
    if (dirty) {
      setExitOpen(true);
      return;
    }
    requestCancel();
  }, [dirty, pending, requestCancel, setExitOpen]);

  const handleDraftCountChange = useCallback(
    (count: number) => {
      setDraftCount(count);
      if (count) setDirty(true);
    },
    [setDirty, setDraftCount],
  );

  useEffect(() => {
    onCloseRequestRegistration(requestExit);
    return () => onCloseRequestRegistration(null);
  }, [onCloseRequestRegistration, requestExit]);

  function selectStep(nextStepId: ResearchItemFormStep["id"]) {
    if (nextStepId === stepId) return;
    setStepId(nextStepId);
    setError(undefined);
    scrollNodeRef.current?.scrollTo({ behavior: "smooth", top: 0 });
  }

  function refreshDraftState() {
    setDirty(true);
    window.setTimeout(() => {
      if (formRef.current)
        setCanSave(researchDraftCanSave(new FormData(formRef.current), category));
    });
  }

  async function save() {
    if (!formRef.current || pending) return;
    const form = new FormData(formRef.current);
    if (!researchDraftCanSave(form, category)) return;
    const input = researchItemInputFromForm({ category, context, form, item, tripId });
    setMutationPending(true);
    setError(undefined);
    const result = item
      ? await updateResearchItem({ ...input, id: item.id })
      : await createResearchItem(input);
    if (result.error || !result.data) {
      setMutationPending(false);
      setError(result.error ?? "This idea could not be saved.");
      return;
    }
    try {
      const saved = await commitAttachments(result.data);
      setMutationPending(false);
      onSaved(saved);
      onCancel();
    } catch (attachmentError) {
      setMutationPending(false);
      setError(
        attachmentError instanceof Error
          ? attachmentError.message
          : "The idea was saved, but its new files could not be committed.",
      );
    }
  }

  return (
    <PlannerEditorForm
      after={
        <>
          <AttachmentSessionDiscardDialog
            error={attachmentError}
            onDiscard={discardAttachments}
            onOpenChange={setDiscardDialogOpen}
            open={discardDialogOpen}
            pending={discardPending}
            uploadPending={attachmentPending}
          />
          <PlannerItemExitDialog
            editing={Boolean(item)}
            onDiscard={() => {
              setExitOpen(false);
              requestCancel();
            }}
            onOpenChange={setExitOpen}
            open={exitOpen}
          />
        </>
      }
      backDisabled={activeIndex === 0}
      formRef={formRef}
      header={
        <PlannerEditorHeader
          description={`${t("Step {current} of {total}.", {
            current: activeIndex + 1,
            total: steps.length,
          })} ${t(researchItemStepDescription(category, stepId))}`}
          error={error}
          navigation={
            <PlannerItemStepNav activeStepId={stepId} onSelect={selectStep} steps={steps} />
          }
          onClose={requestExit}
          title={t(item ? "Edit {item}" : "Add {item}", { item: t(label) })}
        />
      }
      nextDisabled={activeIndex === steps.length - 1}
      onBack={() => selectStep(steps[Math.max(0, activeIndex - 1)].id)}
      onClose={requestExit}
      onFormChange={refreshDraftState}
      onNext={() => selectStep(steps[Math.min(steps.length - 1, activeIndex + 1)].id)}
      onSave={save}
      onScrollNode={(node) => {
        scrollNodeRef.current = node;
      }}
      pending={pending}
      pendingLabel={attachmentPending ? "Updating attachments…" : "Saving…"}
      saveDisabled={!canSave}
    >
      <ResearchItemFields
        activeStepId={stepId}
        attachments={
          <ResearchAttachments
            item={item}
            onDraftCountChange={handleDraftCountChange}
            onPendingChange={setAttachmentPending}
            tripId={tripId}
            uploadSessionId={uploadSessionId}
            uploadSessionSignal={uploadSessionSignal}
          />
        }
        category={category}
        defaultCurrency={defaultCurrency}
        item={item}
      />
    </PlannerEditorForm>
  );
}
