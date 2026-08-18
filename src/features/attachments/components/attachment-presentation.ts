import type { OwnerAttachment } from "@/features/attachments/schema";

import type { ViewerAttachment } from "./attachment-viewer";

export function ownerAttachmentUrl(tripId: string, publicRef: string, thumbnail = false) {
  return `/api/trips/${tripId}/assets/${publicRef}${thumbnail ? "?variant=thumbnail" : ""}`;
}

export function viewerAttachment(tripId: string, attachment: OwnerAttachment): ViewerAttachment {
  return {
    byteSize: attachment.byteSize,
    fileName: attachment.fileName,
    id: attachment.publicRef,
    kind: attachment.kind,
    mimeType: attachment.mimeType,
    ...(attachment.kind !== "pdf" && {
      thumbnailUrl: ownerAttachmentUrl(tripId, attachment.publicRef, true),
    }),
    url: ownerAttachmentUrl(tripId, attachment.publicRef),
  };
}
