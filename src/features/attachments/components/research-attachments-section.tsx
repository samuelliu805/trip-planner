"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { PersistentUploadControls } from "./persistent-upload-controls";
import { useEffect, useState, useTransition } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { loadLatestAttachments } from "@/features/attachments/actions";
import type { OwnerAttachment } from "@/features/attachments/schema";
import { captureAttachmentIntent } from "@/features/attachments/telemetry-client";

import type { ResearchItem } from "@/features/research/types";
import { useAttachmentMutations } from "./use-attachment-mutations";
import { useAttachmentCollection } from "./use-attachment-collection";

import { AttachmentViewer } from "./attachment-viewer";
import { AttachmentDeleteDialog } from "./attachment-delete-dialog";
import { viewerAttachment } from "./attachment-presentation";
import { OwnerAttachmentCard } from "./owner-attachment-card";
export function SavedResearchAttachments({
  item,
  onDraftCountChange,
  onPendingChange,
  tripId,
  uploadSessionId,
}: {
  item: ResearchItem;
  onDraftCountChange?: (count: number) => void;
  onPendingChange?: (pending: boolean) => void;
  tripId: string;
  uploadSessionId: string;
  uploadSessionSignal: AbortSignal;
}) {
  const { t } = useI18n();
  const { attachments, version: researchVersion, confirm } = useAttachmentCollection(item);
  const [error, setError] = useState<string>();
  const [viewerId, setViewerId] = useState<string>();
  const [viewerTrigger, setViewerTrigger] = useState<HTMLElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OwnerAttachment>();
  const [mutationPending, startMutation] = useTransition();
  const draftCount = attachments.filter(({ draft }) => draft).length;
  const viewerAttachments = attachments
    .filter(({ status }) => status === "ready")
    .map((attachment) => viewerAttachment(tripId, attachment));

  useEffect(() => onDraftCountChange?.(draftCount), [draftCount, onDraftCountChange]);

  const mutations = useAttachmentMutations(tripId, item.id, "research", confirm);
  function confirmDelete() {
    if (!deleteTarget) return;
    try {
      mutations.accept(deleteTarget, "delete", null, researchVersion);
      setDeleteTarget(undefined);
      setError(undefined);
    } catch (error) {
      setError(String(error));
    }
  }

  return (
    <section
      aria-labelledby="attachments-heading"
      className="min-w-0 space-y-3 border-t pt-4"
      data-attachment-editor=""
    >
      <PersistentUploadControls
        entityId={item.id}
        tripId={tripId}
        sessionId={uploadSessionId}
        target="research"
        attachments={attachments}
        onComplete={confirm}
        onPendingChange={onPendingChange}
      />
      {attachments.map((attachment) => (
        <OwnerAttachmentCard
          attachment={attachment}
          disabled={false}
          pending={mutations.pending(attachment.publicRef)}
          key={attachment.publicRef}
          onDelete={() => setDeleteTarget(attachment)}
          onOpen={(trigger) => {
            captureAttachmentIntent("attachment_opened", "research");
            setViewerTrigger(trigger);
            setViewerId(attachment.publicRef);
          }}
          onShareChange={() => undefined}
          shareAttachmentsEnabled={false}
          showShareControl={false}
          tripId={tripId}
        />
      ))}
      {!attachments.length ? (
        <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
          <T
            message={
              " Files stay private here and are copied into the Plan when you Apply this idea. "
            }
          />
        </div>
      ) : null}
      {draftCount ? (
        <p className="text-xs leading-5 text-muted-foreground">
          {t("Save this idea to keep {count} new file(s).", { count: draftCount })}
        </p>
      ) : null}
      {mutations.error ? (
        <p role="alert" className="text-sm text-destructive">
          {mutations.error}
        </p>
      ) : null}
      {error ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-destructive">
            <Localized value={error} />
          </p>
          {error.includes("Reload") ? (
            <Button
              className="min-h-11"
              onClick={() =>
                startMutation(async () => {
                  const latest = await loadLatestAttachments({
                    entityId: item.id,
                    target: "research",
                    tripId,
                  });
                  if ("error" in latest) {
                    setError(latest.error);
                    return;
                  }
                  confirm(latest.data, latest.version, latest.attachmentsVersion);
                  setError(undefined);
                })
              }
              type="button"
              variant="outline"
            >
              <RotateCcw className="size-4" /> <T message="Reload latest attachments" />
            </Button>
          ) : null}
        </div>
      ) : null}
      <AttachmentViewer
        attachments={viewerAttachments}
        initialId={viewerId}
        onOpenChange={(nextOpen) => !nextOpen && setViewerId(undefined)}
        open={Boolean(viewerId)}
        trigger={viewerTrigger}
      />
      <AttachmentDeleteDialog
        fileName={deleteTarget?.fileName}
        onConfirm={confirmDelete}
        onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(undefined)}
        open={Boolean(deleteTarget)}
        pending={mutationPending}
        target="research"
      />
    </section>
  );
}
