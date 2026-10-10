"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ResearchAttachments } from "@/features/attachments/components/research-attachments";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import { useDraftScope } from "@/features/editing/draft-scope";
import { editingStorageKey } from "@/features/editing/draft-storage";
import { useDurableFields } from "@/features/editing/use-durable-fields";
import { useDraftAutosave } from "@/features/editing/use-draft-autosave";
import { PersistentEditorFields } from "@/features/editing/persistent-editor-fields";
import { Button } from "@/components/ui/button";
import { AttachmentSessionDiscardDialog } from "@/features/itinerary/components/attachment-session-discard-dialog";
import { PlannerEditorForm } from "@/features/itinerary/components/planner-editor-form";
import { PlannerEditorHeader } from "@/features/itinerary/components/planner-editor-header";
import { PlannerItemExitDialog } from "@/features/itinerary/components/planner-item-exit-dialog";
import { PlannerItemStepNav } from "@/features/itinerary/components/planner-item-step-nav";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { ResearchItemFields } from "./research-item-fields";
import { createResearchItem, loadResearchItem, updateResearchItem } from "../actions";
import { useResearchSync } from "../use-research-sync";
import { researchDraftCanSave, researchItemInputFromForm } from "../research-item-form-values";
import type { CreateResearchItemInput } from "../schema";
import {
  researchItemFormSteps,
  researchItemStepDescription,
  type ResearchItemFormStep,
} from "../research-item-form-steps";
import {
  researchCategorySingularLabels,
  type ResearchCategory,
  type ResearchItem,
  type ResearchMutationResult,
} from "../types";

export function ResearchItemForm({
  category,
  context,
  defaultCurrency,
  item,
  localSave,
  onCancel,
  onCloseRequestRegistration,
  onSaved,
  tripId,
}: {
  category: ResearchCategory;
  context?: { dayId?: string; itemId?: string };
  defaultCurrency: string;
  item?: ResearchItem;
  localSave?: (
    input: CreateResearchItemInput,
    existingId?: string,
  ) => Promise<ResearchMutationResult<ResearchItem>>;
  onCancel: () => void;
  onCloseRequestRegistration: (handler: (() => void) | null) => void;
  onSaved: (item: ResearchItem) => void;
  tripId: string;
}) {
  const { t } = useI18n();
  const sync = useResearchSync(tripId);
  const actorScope = useDraftScope(tripId, "ideas");
  const [creationId] = useState(() => crypto.randomUUID());
  const draft = useDurableFields(
    editingStorageKey(
      useDraftScope(tripId, "ideas"),
      item ? `item:${item.id}` : `new:${category}:${context?.dayId ?? ""}:${context?.itemId ?? ""}`,
    ),
    { fields: {} as Record<string, unknown>, creationId },
    { ignoreDirty: ["creationId"] },
  );
  const steps = researchItemFormSteps(category);
  const [stepId, setStepId] = useState<ResearchItemFormStep["id"]>("primary");
  const [mutationPending, setMutationPending] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [canSave, setCanSave] = useState(Boolean(item));
  const [error, setError] = useState<string>();
  const [conflict, setConflict] = useState(false);
  const [baseVersion, setBaseVersion] = useState(item?.version);
  const [latestItem, setLatestItem] = useState<ResearchItem>();
  const [exitOpen, setExitOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollNodeRef = useRef<HTMLDivElement | null>(null);
  const label = researchCategorySingularLabels[category];
  const activeIndex = steps.findIndex(({ id }) => id === stepId);
  const attachmentSession = useAttachmentEditSession({
    draftId: draft.values.creationId,
    item: localSave ? undefined : item,
    itemMutationPending: mutationPending,
    onCancel,
    targetKind: "research",
    tripId,
  });
  const {
    attachmentPending,
    discard: discardAttachments,
    discardDialogOpen,
    discardPending,
    draftCount,
    error: attachmentError,
    markHandled,
    setAttachmentPending,
    setDiscardDialogOpen,
    setDraftCount,
    uploadSessionId,
    uploadSessionSignal,
  } = attachmentSession;
  const pending = mutationPending;
  const attachmentOnlySave = Boolean(item && !formDirty && draftCount > 0);
  const autosave = useDraftAutosave(
    Boolean(item && (formDirty || Object.keys(draft.values.fields).length > 0)),
    JSON.stringify(draft.values.fields),
    () => save(true),
  );
  const flushAutosave = autosave.flush;

  const requestExit = useCallback(() => {
    flushAutosave();
    onCancel();
  }, [flushAutosave, onCancel]);

  const handleDraftCountChange = useCallback(
    (count: number) => {
      setDraftCount(count);
    },
    [setDraftCount],
  );

  useEffect(() => {
    onCloseRequestRegistration(requestExit);
    return () => onCloseRequestRegistration(null);
  }, [onCloseRequestRegistration, requestExit]);
  useEffect(() => {
    Promise.resolve().then(() => {
      if (formRef.current)
        setCanSave(researchDraftCanSave(new FormData(formRef.current), category));
    });
  }, [category, draft.values.fields]);

  function selectStep(nextStepId: ResearchItemFormStep["id"]) {
    if (nextStepId === stepId) return;
    setStepId(nextStepId);
    setError(undefined);
    scrollNodeRef.current?.scrollTo({ behavior: "smooth", top: 0 });
  }

  function refreshDraftState(event: React.FormEvent<HTMLFormElement>) {
    if ((event.target as Element).closest("[data-attachment-editor]")) return;
    setFormDirty(true);
    window.setTimeout(() => {
      if (formRef.current)
        setCanSave(researchDraftCanSave(new FormData(formRef.current), category));
    });
  }

  async function save(background = false) {
    if (background && !item) return;
    if (background && !draft.hasChanges()) return;
    if (!localSave && actorScope[1] !== "guest" && !sync) {
      setError("Ideas sync is unavailable. Your local draft is kept.");
      return;
    }
    if (!formRef.current || pending) return;
    const form = new FormData(formRef.current);
    if (!draft.persist()) return;
    const snapshot = JSON.stringify(draft.getValues());
    if (!attachmentOnlySave && !researchDraftCanSave(form, category)) return;
    setMutationPending(true);
    setError(undefined);
    try {
      const input = researchItemInputFromForm({ category, context, form, item, tripId });
      const operationId = item ? newTelemetryOperationId() : draft.values.creationId;
      if (!item && !localSave)
        captureBrowserProductEvent(
          "research_create_started",
          { ideas_category: category, operation_id: operationId, surface: "research_editor" },
          { actorType: "authenticated" },
        );
      const result =
        sync && !localSave
          ? {
              data: sync.accept(
                item
                  ? {
                      kind: "update",
                      input: {
                        ...input,
                        draftSessionId: uploadSessionId,
                        expectedVersion: baseVersion ?? item.version,
                        id: item.id,
                        operationId,
                      },
                    }
                  : {
                      kind: "create",
                      input: { ...input, draftSessionId: uploadSessionId, operationId },
                    },
                item,
              ),
              error: undefined,
              code: undefined,
            }
          : localSave
            ? await localSave({ ...input, operationId }, item?.id)
            : item
              ? await updateResearchItem({
                  ...input,
                  draftSessionId: uploadSessionId,
                  expectedVersion: baseVersion ?? item.version,
                  id: item.id,
                  operationId,
                })
              : await createResearchItem({
                  ...input,
                  draftSessionId: uploadSessionId,
                  operationId,
                });
      if (result.error || !result.data) {
        setMutationPending(false);
        setConflict(result.code === "conflict");
        setError(result.error ?? "This idea could not be saved.");
        return;
      }
      markHandled();
      draft.discardIfMatches(snapshot);
      setMutationPending(false);
      onSaved(result.data);
      setBaseVersion(result.data.version);
      if (!background && JSON.stringify(draft.getValues()) === snapshot) onCancel();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setMutationPending(false);
    }
  }

  async function reloadLatest() {
    if (!item) return;
    const result = await loadResearchItem(tripId, item.id);
    if (!result.data) return setError(result.error ?? "The latest idea could not be loaded.");
    setBaseVersion(result.data.version);
    setLatestItem(result.data);
    setConflict(false);
    setError(undefined);
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
              if (draft.discard()) onCancel();
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
      onSave={() => save()}
      onCompositionChange={autosave.composition}
      onScrollNode={(node) => {
        scrollNodeRef.current = node;
      }}
      pending={pending}
      pendingLabel={attachmentPending ? "Updating attachments…" : "Saving…"}
      saveDisabled={!canSave && !attachmentOnlySave}
    >
      {conflict ? (
        <button
          className="min-h-11 rounded-md border border-destructive px-4 text-sm font-medium text-destructive"
          onClick={() => void reloadLatest()}
          type="button"
        >
          {t("Reload latest")}
        </button>
      ) : null}
      {latestItem ? (
        <div className="rounded-md border bg-muted/40 p-3 text-sm" role="status">
          <p>{t("Latest loaded. Your draft is still here and can be saved again.")}</p>
          <button
            className="mt-2 min-h-11 rounded-md border px-3 font-medium"
            onClick={() => onSaved(latestItem)}
            type="button"
          >
            {t("Use latest values")}
          </button>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-wrap gap-2" role="status">
        <T message={draft.error ? "Local save failed" : draft.saved ? "Saved locally" : "Draft"} />
        {draft.error ? (
          <Button type="button" onClick={draft.download}>
            <T message="Download draft" />
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setExitOpen(true)}>
          <T message="Discard draft" />
        </Button>
      </div>
      <PersistentEditorFields draft={draft}>
        <ResearchItemFields
          activeStepId={stepId}
          attachments={
            localSave ? null : (
              <ResearchAttachments
                creationId={draft.values.creationId}
                item={item}
                onDraftCountChange={handleDraftCountChange}
                onPendingChange={setAttachmentPending}
                tripId={tripId}
                uploadSessionId={uploadSessionId}
                uploadSessionSignal={uploadSessionSignal}
              />
            )
          }
          category={category}
          defaultCurrency={defaultCurrency}
          item={item}
        />
      </PersistentEditorFields>
    </PlannerEditorForm>
  );
}
