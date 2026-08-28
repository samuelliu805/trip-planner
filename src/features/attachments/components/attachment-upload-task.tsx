import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { LoaderCircle, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AttachmentUploadProgress } from "@/features/attachments/upload-client";

export type UploadTask = {
  controller: AbortController;
  error?: string;
  file: File;
  id: string;
  operationId: string;
  progress: AttachmentUploadProgress;
};

export function AttachmentUploadTask({
  onCancel,
  onDismiss,
  onRetry,
  task,
}: {
  onCancel: () => void;
  onDismiss: () => void;
  onRetry: () => void;
  task: UploadTask;
}) {
  const { t } = useI18n();
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 p-3">
      <div className="flex min-w-0 items-center gap-2">
        {task.error ? (
          <RefreshCw aria-hidden="true" className="size-4 shrink-0 text-destructive" />
        ) : (
          <LoaderCircle aria-hidden="true" className="size-4 shrink-0 animate-spin" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{task.file.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {task.error ? <T message="Failed" /> : `${task.progress.percent}%`}
        </span>
      </div>
      {task.error ? (
        <div className="mt-2 flex min-w-0 items-start gap-2">
          <p className="min-w-0 flex-1 text-xs leading-5 text-destructive">
            <Localized value={task.error} />
          </p>
          <Button className="min-h-11" onClick={onRetry} size="sm" type="button" variant="outline">
            <T message={" Retry "} />
          </Button>
          <Button
            aria-label={t("Dismiss {file}", { file: task.file.name })}
            className="size-11 p-0"
            onClick={onDismiss}
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{ width: `${task.progress.percent}%` }}
            />
          </div>
          <Button className="min-h-11" onClick={onCancel} size="sm" type="button" variant="ghost">
            <T message={" Cancel "} />
          </Button>
        </div>
      )}
    </div>
  );
}
