"use client";

import type { ResearchItem } from "@/features/research/types";

import { SavedResearchAttachments } from "./research-attachments-section";
import { UnsavedAttachmentsSection } from "./unsaved-attachments-section";

export function ResearchAttachments({
  item,
  onDraftCountChange,
  onPendingChange,
  tripId,
  uploadSessionId,
  uploadSessionSignal,
}: {
  item?: ResearchItem;
  onDraftCountChange?: (count: number) => void;
  onPendingChange?: (pending: boolean) => void;
  tripId: string;
  uploadSessionId: string;
  uploadSessionSignal: AbortSignal;
}) {
  if (!item) return <UnsavedAttachmentsSection />;
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
