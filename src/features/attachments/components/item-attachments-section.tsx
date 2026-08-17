"use client";

import { LoaderCircle, Paperclip, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { detachAttachment, setAttachmentShare } from "@/features/attachments/actions";
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENTS_PER_ITEM,
  MAX_ITEM_ATTACHMENT_BYTES,
  attachmentAcceptedTypeCopy,
} from "@/features/attachments/config";
import type { OwnerAttachment } from "@/features/attachments/schema";
import { uploadFileAttachment } from "@/features/attachments/upload-client";
import type { ItineraryItem } from "@/features/itinerary/types";

import { AttachmentViewer } from "./attachment-viewer";
import { viewerAttachment } from "./attachment-presentation";
import { AttachmentUploadTask, type UploadTask } from "./attachment-upload-task";
import { OwnerAttachmentCard } from "./owner-attachment-card";
import { ShareAttachmentsCallout } from "./share-attachments-callout";
export function SavedItemAttachmentsSection({
  item,
  onOpenShareSettings,
  onPendingChange,
  shareAttachmentsEnabled,
  tripId,
}: {
  item: ItineraryItem;
  onOpenShareSettings: () => void;
  onPendingChange?: (pending: boolean) => void;
  shareAttachmentsEnabled: boolean;
  tripId: string;
}) {
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

  useEffect(() => {
    onPendingChange?.(pending);
  }, [onPendingChange, pending]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);

  function updateTask(id: string, values: Partial<UploadTask>) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, ...values } : task)));
  }

  async function runUpload(task: UploadTask) {
    try {
      const attachment = await uploadFileAttachment({
        file: task.file,
        itemId: item.id,
        onProgress: (progress) => updateTask(task.id, { progress }),
        signal: task.controller.signal,
        tripId,
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
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setTasks((current) => current.filter(({ id }) => id !== task.id));
        return;
      }
      updateTask(task.id, {
        error: caught instanceof Error ? caught.message : "The upload failed.",
      });
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
    const queued = files.map((file): UploadTask => ({
      controller: new AbortController(),
      file,
      id: crypto.randomUUID(),
      progress: { percent: 0, stage: "hashing" },
    }));
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
    <section className="min-w-0 space-y-3 border-t pt-4" aria-labelledby="attachments-heading">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-medium" id="attachments-heading">
            <Paperclip aria-hidden="true" className="size-4" /> Attachments
            <span className="font-normal text-muted-foreground">
              {countedAttachments.length}/{MAX_ATTACHMENTS_PER_ITEM}
            </span>
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {attachmentAcceptedTypeCopy}
          </p>
        </div>
        <input
          accept={ATTACHMENT_ACCEPT}
          className="sr-only"
          disabled={!remaining}
          multiple
          onChange={(event) => {
            queueFiles(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
        <Button
          className="min-h-11 shrink-0"
          disabled={!remaining}
          onClick={() => inputRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          <UploadCloud aria-hidden="true" className="size-4" /> Add files
        </Button>
      </div>

      {tasks.map((task) => (
        <AttachmentUploadTask
          key={task.id}
          onCancel={() => task.controller.abort()}
          onDismiss={() => setTasks((current) => current.filter(({ id }) => id !== task.id))}
          onRetry={() => {
            const retry = { ...task, controller: new AbortController(), error: undefined };
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
          Tickets, confirmations, maps, menus, and short videos stay private until you explicitly
          share each one.
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <AttachmentViewer
        attachments={viewerAttachments}
        initialId={viewerId}
        onOpenChange={(open) => !open && setViewerId(undefined)}
        open={Boolean(viewerId)}
        trigger={viewerTrigger}
      />
      <AlertDialog
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent data-attachment-overlay="">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this attachment?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes “{deleteTarget?.fileName}” from this itinerary item and its shared page.
              A deduplicated copy remains only if another item still uses it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutationPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={mutationPending} onClick={confirmDelete}>
              {mutationPending ? <LoaderCircle className="size-4 animate-spin" /> : null}
              Delete attachment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
