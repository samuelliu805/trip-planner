import { Download, Eye, FileText, Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/features/attachments/config";
import type { OwnerAttachment } from "@/features/attachments/schema";

import { ownerAttachmentUrl } from "./attachment-presentation";

function ownerAttachmentType(attachment: OwnerAttachment) {
  if (attachment.mimeType === "image/jpeg") return "JPG Image";
  if (attachment.mimeType === "image/png") return "PNG Image";
  if (attachment.mimeType === "image/webp") return "WebP Image";
  if (attachment.mimeType === "video/mp4") return "MP4 Video";
  if (attachment.mimeType === "video/webm") return "WebM Video";
  if (attachment.mimeType === "video/quicktime") return "MOV Video";
  return "PDF";
}

function AttachmentTile({ attachment, tripId }: { attachment: OwnerAttachment; tripId: string }) {
  if (attachment.kind === "pdf")
    return (
      <span className="grid size-14 shrink-0 place-items-center rounded-md bg-red-50 text-red-700">
        <FileText aria-hidden="true" className="size-6" />
      </span>
    );
  return (
    <span className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated redirect URL. */}
      <img
        alt=""
        className="absolute inset-0 size-full object-cover"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.hidden = true;
        }}
        src={ownerAttachmentUrl(tripId, attachment.publicRef, true)}
      />
      {attachment.kind === "video" ? (
        <span className="relative grid size-7 place-items-center rounded-full bg-black/65 text-white">
          <Play aria-hidden="true" className="size-4 fill-current" />
        </span>
      ) : null}
    </span>
  );
}

export function OwnerAttachmentCard({
  attachment,
  disabled,
  onDelete,
  onOpen,
  onShareChange,
  showShareControl = true,
  shareAttachmentsEnabled,
  tripId,
}: {
  attachment: OwnerAttachment;
  disabled: boolean;
  onDelete: () => void;
  onOpen: (trigger: HTMLElement) => void;
  onShareChange: (checked: boolean) => void;
  shareAttachmentsEnabled: boolean;
  showShareControl?: boolean;
  tripId: string;
}) {
  return (
    <article className="min-w-0 rounded-md border p-3">
      <div className="flex min-w-0 items-start gap-3">
        <button
          aria-label={`Open ${attachment.fileName}`}
          className="shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => onOpen(event.currentTarget)}
          type="button"
        >
          <AttachmentTile attachment={attachment} tripId={tripId} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium">{attachment.fileName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ownerAttachmentType(attachment)} · {formatBytes(attachment.byteSize)}
          </p>
          <p className="mt-1 text-xs font-medium">
            {attachment.draft
              ? "Not saved yet"
              : attachment.includeInShare
                ? shareAttachmentsEnabled
                  ? "Shared"
                  : "Share page attachments off"
                : "Private"}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            <Button
              className="min-h-11 min-w-0 justify-start px-1 text-primary underline decoration-primary/40 underline-offset-4 hover:bg-transparent hover:text-primary"
              onClick={(event) => onOpen(event.currentTarget)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Eye aria-hidden="true" className="size-4 shrink-0" /> Preview
            </Button>
            <Button asChild className="size-11 shrink-0 p-0" variant="ghost">
              <a
                aria-label={`Download ${attachment.fileName}`}
                href={`${ownerAttachmentUrl(tripId, attachment.publicRef)}?download=1`}
              >
                <Download aria-hidden="true" className="size-4" />
              </a>
            </Button>
            <Button
              aria-label={`Delete ${attachment.fileName}`}
              className="size-11 shrink-0 p-0 text-destructive"
              disabled={disabled}
              onClick={onDelete}
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>
      </div>
      {showShareControl ? (
        <div className="mt-3 border-t pt-2">
          <Label className="flex min-h-11 min-w-0 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={attachment.includeInShare}
              disabled={disabled || attachment.status !== "ready"}
              onCheckedChange={(checked) => onShareChange(checked === true)}
            />
            <span className="min-w-0">Share file</span>
          </Label>
        </div>
      ) : null}
    </article>
  );
}
