"use client";

import type { ResearchItem } from "@/features/research/types";

import { SavedResearchAttachments } from "./research-attachments-section";
import { PersistentUploadControls } from "./persistent-upload-controls";

export function ResearchAttachments({
  creationId,
  item,
  onDraftCountChange,
  onPendingChange,
  tripId,
  uploadSessionId,
  uploadSessionSignal,
}: {
  creationId?: string;
  item?: ResearchItem;
  onDraftCountChange?: (count: number) => void;
  onPendingChange?: (pending: boolean) => void;
  tripId: string;
  uploadSessionId: string;
  uploadSessionSignal: AbortSignal;
}) {
  if (!item)
    return creationId ? (
      <section className="border-t pt-4">
        <PersistentUploadControls
          entityId={creationId}
          parentOperationId={creationId}
          tripId={tripId}
          sessionId={uploadSessionId}
          target="research"
          onPendingChange={onPendingChange}
        />
      </section>
    ) : null;
  return (
    <SavedResearchAttachments
      item={item}
      key={`${item.id}:${item.attachments?.map(({ publicRef }) => publicRef).join(",")}`}
      onDraftCountChange={onDraftCountChange}
      onPendingChange={onPendingChange}
      tripId={tripId}
      uploadSessionId={uploadSessionId}
      uploadSessionSignal={uploadSessionSignal}
    />
  );
}
