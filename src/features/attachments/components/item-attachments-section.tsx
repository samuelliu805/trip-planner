"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  detachAttachment,
  reportAttachmentUploadFailure,
  setAttachmentShare,
} from "@/features/attachments/actions";
import { MAX_ATTACHMENTS_PER_ITEM, MAX_ITEM_ATTACHMENT_BYTES } from "@/features/attachments/config";
import type { OwnerAttachment } from "@/features/attachments/schema";
import { captureAttachmentIntent } from "@/features/attachments/telemetry-client";
import { uploadFileAttachment } from "@/features/attachments/upload-client";
import {
  attachmentUploadWasAborted,
  reportUnacknowledgedAttachmentFailure,
} from "@/features/attachments/upload-failure";
import type { ItineraryItem } from "@/features/itinerary/types";
import { newTelemetryOperationId } from "@/lib/telemetry/product";

import { AttachmentViewer } from "./attachment-viewer";
import { AttachmentDeleteDialog } from "./attachment-delete-dialog";
import { viewerAttachment } from "./attachment-presentation";
import { AttachmentsSectionHeader } from "./attachments-section-header";
import { AttachmentUploadTask, type UploadTask } from "./attachment-upload-task";
import { OwnerAttachmentCard } from "./owner-attachment-card";
import { ShareAttachmentsCallout } from "./share-attachments-callout";
export function SavedItemAttachmentsSection({
  item,
  onDraftCountChange,
  onOpenShareSettings,
  onPendingChange,
  shareAttachmentsEnabled,
  tripId,
  uploadSessionId,
  uploadSessionSignal,
}: {
  item: ItineraryItem;
  onDraftCountChange?: (count: number) => void;
  onOpenShareSettings: () => void;
  onPendingChange?: (pending: boolean) => void;
  shareAttachmentsEnabled: boolean;
  tripId: string;
  uploadSessionId: string;
  uploadSessionSignal: AbortSignal;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [attachments, setAttachments] = useState<OwnerAttachment[]>(item?.attachments ?? []);
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [error, setError] = useState<string>();
  const [viewerId, setViewerId] = useState<string>();
  const [viewerTrigger, setViewerTrigger] = useState<HTMLElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OwnerAttachment>();
  const [mutationPending, startMutation] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const countedAttachments = attachments.filter(({ status }) =>
    ["pending", "ready"].includes(status),
  );
  const activeTasks = tasks.filter(
    ({ error, progress }) => !error && progress.stage !== "complete",
  );
  const remaining = Math.max(
    0,
    MAX_ATTACHMENTS_PER_ITEM - countedAttachments.length - activeTasks.length,
  );
  const currentBytes = countedAttachments.reduce((sum, attachment) => sum + attachment.byteSize, 0);
  const viewerAttachments = attachments
    .filter(({ status }) => status === "ready")
    .map((attachment) => viewerAttachment(tripId, attachment));
  const hasShareEligibleAttachment = attachments.some(
    ({ includeInShare, status }) => includeInShare && status === "ready",
  );
  const pending = activeTasks.length > 0 || mutationPending;
  const draftCount = attachments.filter(({ draft }) => draft).length;

  useEffect(() => {
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);
  useEffect(() => {
    onDraftCountChange?.(draftCount);
  }, [draftCount, onDraftCountChange]);
  useEffect(() => {
    const abortTasks = () =>
      setTasks((current) => {
        current.forEach(({ controller }) => controller.abort());
        return current;
      });
    uploadSessionSignal.addEventListener("abort", abortTasks, { once: true });
    return () => uploadSessionSignal.removeEventListener("abort", abortTasks);
  }, [uploadSessionSignal]);

  function updateTask(id: string, values: Partial<UploadTask>) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...values } : task)));
  }

  async function runUpload(task: UploadTask) {
    try {
      const attachment = await uploadFileAttachment({
        file: task.file,
        itemId: item.id,
        onProgress: (progress) => updateTask(task.id, { progress }),
        operationId: task.operationId,
        signal: task.controller.signal,
        tripId,
        uploadSessionId,
      });
      setAttachments((current) =>
        [...current.filter(({ publicRef }) => publicRef !== attachment.publicRef), attachment].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        ),
      );
      setTasks((current) => current.filter(({ id }) => id !== task.id));
      setError(undefined);
      router.refresh();
    } catch (caught) {
      if (attachmentUploadWasAborted(caught)) {
        setTasks((current) => current.filter(({ id }) => id !== task.id));
        return;
      }
      updateTask(task.id, {
        error: caught instanceof Error ? caught.message : "The upload failed.",
      });
      await reportUnacknowledgedAttachmentFailure(caught, () =>
        reportAttachmentUploadFailure({ operationId: task.operationId, target: "itinerary" }),
      );
    }
  }

  function queueFiles(files: File[]) {
    setError(undefined);
    if (files.length > remaining) {
      setError(`Choose up to ${remaining} more ${remaining === 1 ? "file" : "files"}.`);
      return;
    }
    if (
      currentBytes + files.reduce((sum, file) => sum + file.size, 0) >
      MAX_ITEM_ATTACHMENT_BYTES
    ) {
      setError("These files would exceed this item’s 50 MB attachment limit.");
      return;
    }
    const queued = files.map((file): UploadTask => {
      const operationId = captureAttachmentIntent("attachment_upload_started", "itinerary");
      return {
        controller: new AbortController(),
        file,
        id: crypto.randomUUID(),
        operationId,
        progress: { percent: 0, stage: "hashing" },
      };
    });
    setTasks((current) => [...current, ...queued]);
    void queued.reduce((previous, task) => previous.then(() => runUpload(task)), Promise.resolve());
  }

  function toggleShare(attachment: OwnerAttachment, checked: boolean) {
    setError(undefined);
    startMutation(async () => {
      const result = await setAttachmentShare({
        includeInShare: checked,
        itemId: item.id,
        publicRef: attachment.publicRef,
        tripId,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setAttachments((current) =>
        current.map((entry) => (entry.publicRef === result.data.publicRef ? result.data : entry)),
      );
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setError(undefined);
    startMutation(async () => {
      const result = await detachAttachment({
        itemId: item.id,
        operationId: newTelemetryOperationId(),
        publicRef: target.publicRef,
        tripId,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setAttachments((current) =>
        current.filter(({ publicRef }) => publicRef !== target.publicRef),
      );
      setDeleteTarget(undefined);
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="attachments-heading"
      className="min-w-0 space-y-3 border-t pt-4"
      data-attachment-editor=""
    >
      <AttachmentsSectionHeader
        count={countedAttachments.length}
        disabled={!remaining || activeTasks.length > 0}
        inputRef={inputRef}
        onFiles={queueFiles}
      />

      {tasks.map((task) => (
        <AttachmentUploadTask
          key={task.id}
          onCancel={() => task.controller.abort()}
          onDismiss={() => setTasks((current) => current.filter(({ id }) => id !== task.id))}
          onRetry={() => {
            const operationId = captureAttachmentIntent("attachment_upload_started", "itinerary");
            const retry = {
              ...task,
              controller: new AbortController(),
              error: undefined,
              operationId,
            };
            updateTask(task.id, retry);
            void runUpload(retry);
          }}
          task={task}
        />
      ))}

      {attachments.map((attachment) => (
        <OwnerAttachmentCard
          attachment={attachment}
          disabled={mutationPending}
          key={attachment.publicRef}
          onDelete={() => setDeleteTarget(attachment)}
          onOpen={(trigger) => {
            captureAttachmentIntent("attachment_opened", "itinerary");
            setViewerTrigger(trigger);
            setViewerId(attachment.publicRef);
          }}
          onShareChange={(checked) => toggleShare(attachment, checked)}
          shareAttachmentsEnabled={shareAttachmentsEnabled}
          tripId={tripId}
        />
      ))}

      {hasShareEligibleAttachment && !shareAttachmentsEnabled ? (
        <ShareAttachmentsCallout onOpen={onOpenShareSettings} />
      ) : null}

      {!attachments.length && !tasks.length ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
          <T message={" Files stay private unless you turn on Share file. "} />
        </div>
      ) : null}
      {draftCount ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {t("Save this itinerary item to keep {count} new file(s).", { count: draftCount })}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          <Localized value={error} />
        </p>
      ) : null}

      <AttachmentViewer
        attachments={viewerAttachments}
        initialId={viewerId}
        onOpenChange={(open) => !open && setViewerId(undefined)}
        open={Boolean(viewerId)}
        trigger={viewerTrigger}
      />
      <AttachmentDeleteDialog
        fileName={deleteTarget?.fileName}
        onConfirm={confirmDelete}
        onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(undefined)}
        open={Boolean(deleteTarget)}
        pending={mutationPending}
        target="itinerary"
      />
    </section>
  );
}
