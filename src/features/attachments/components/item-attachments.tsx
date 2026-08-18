"use client";

import type { ItineraryItem } from "@/features/itinerary/types";

import { SavedItemAttachmentsSection } from "./item-attachments-section";
import { UnsavedAttachmentsSection } from "./unsaved-attachments-section";

export function ItemAttachmentsSection({
  item,
  onDraftCountChange,
  onOpenShareSettings,
  onPendingChange,
  shareAttachmentsEnabled,
  uploadSessionId,
  uploadSessionSignal,
  tripId,
}: {
  item?: ItineraryItem;
  onDraftCountChange?: (count: number) => void;
  onOpenShareSettings: () => void;
  onPendingChange?: (pending: boolean) => void;
  shareAttachmentsEnabled: boolean;
  tripId: string;
  uploadSessionId: string;
  uploadSessionSignal: AbortSignal;
}) {
  if (!item) return <UnsavedAttachmentsSection />;
  const attachmentVersion = (item.attachments ?? [])
    .map(({ includeInShare, publicRef, status }) => `${publicRef}:${status}:${includeInShare}`)
    .join(",");
  return (
    <SavedItemAttachmentsSection
      item={item}
      key={`${item.id}:${attachmentVersion}`}
      onDraftCountChange={onDraftCountChange}
      onOpenShareSettings={onOpenShareSettings}
      onPendingChange={onPendingChange}
      shareAttachmentsEnabled={shareAttachmentsEnabled}
      tripId={tripId}
      uploadSessionId={uploadSessionId}
      uploadSessionSignal={uploadSessionSignal}
    />
  );
}
