"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDraftScope } from "@/features/editing/draft-scope";
import { uploadOwner } from "../upload-owners";
import { uploadStorage } from "../upload-storage";
import { MAX_ATTACHMENTS_PER_ITEM, MAX_ITEM_ATTACHMENT_BYTES } from "../config";
import type { OwnerAttachment } from "../schema";
import { AttachmentsSectionHeader } from "./attachments-section-header";
import { AttachmentUploadTask } from "./attachment-upload-task";
import { T } from "@/features/i18n/i18n-provider";
import { Button } from "@/components/ui/button";

export function PersistentUploadControls({
  entityId,
  parentOperationId,
  tripId,
  sessionId,
  target,
  attachments = [],
  onComplete,
  onPendingChange,
}: {
  entityId: string;
  parentOperationId?: string;
  tripId: string;
  sessionId: string;
  target: "itinerary" | "research";
  attachments?: OwnerAttachment[];
  onComplete?: (attachments: OwnerAttachment[]) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const scope = useDraftScope(tripId, "attachments");
  const owner = uploadOwner(scope, entityId, sessionId, target);
  const revision = useSyncExternalStore(owner.subscribe, owner.getSnapshot, () => 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const remaining = MAX_ATTACHMENTS_PER_ITEM - attachments.length - owner.tasks.length;
  useEffect(() => {
    let mounted = true;
    void uploadStorage
      .all()
      .then((records) => owner.restore(records))
      .then(() => {
        if (mounted) owner.enable();
      })
      .catch(() => setError("File recovery storage is unavailable. Files have not been saved."));
    return () => {
      mounted = false;
    };
  }, [owner]);
  useEffect(() => {
    if (owner.completed.length && onComplete) onComplete(owner.consumeCompleted());
  }, [owner, revision, onComplete]);
  useEffect(() => {
    onPendingChange?.(owner.tasks.some((task) => !task.error));
  }, [owner, revision, onPendingChange]);
  return (
    <div className="min-w-0 space-y-3" data-persistent-uploads>
      <AttachmentsSectionHeader
        count={attachments.length + owner.tasks.length}
        disabled={remaining <= 0}
        inputRef={inputRef}
        onFiles={(files) => {
          if (
            files.length > remaining ||
            [...owner.tasks.map((task) => task.file), ...files].reduce(
              (sum, file) => sum + file.size,
              0,
            ) +
              attachments.reduce((sum, file) => sum + file.byteSize, 0) >
              MAX_ITEM_ATTACHMENT_BYTES
          ) {
            setError("These files exceed the attachment count or 50 MB limit.");
            return;
          }
          setError(undefined);
          void owner.enqueue(files, parentOperationId);
        }}
      />
      {parentOperationId && owner.tasks.length ? (
        <p role="status" className="text-xs text-muted-foreground">
          <T
            message={
              owner.error
                ? "Local save failed"
                : owner.hasUnpersistedFiles
                  ? "Draft"
                  : "Saved locally"
            }
          />{" "}
          · <T message="Pending sync" />
        </p>
      ) : null}
      {error || owner.error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? owner.error}
        </p>
      ) : null}
      {owner.tasks.map((task) => (
        <div key={task.id}>
          <AttachmentUploadTask
            task={task}
            onRetry={() => void owner.retry(task.id)}
            onCancel={() => void owner.cancel(task.id)}
            onDismiss={() => void owner.cancel(task.id)}
          />
          {task.error ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const url = URL.createObjectURL(task.file);
                const link = document.createElement("a");
                link.href = url;
                link.download = task.file.name;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 0);
              }}
            >
              <T message="Download" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
