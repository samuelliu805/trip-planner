"use client";

import type { ItineraryItem } from "@/features/itinerary/types";

import { SavedItemAttachmentsSection } from "./item-attachments-section";
import { UnsavedAttachmentsSection } from "./unsaved-attachments-section";

export function ItemAttachmentsSection({
  item,
  onOpenShareSettings,
  onPendingChange,
  shareAttachmentsEnabled,
  tripId,
}: {
  item?: ItineraryItem;
  onOpenShareSettings: () => void;
  onPendingChange?: (pending: boolean) => void;
  shareAttachmentsEnabled: boolean;
  tripId: string;
}) {
  if (!item) return <UnsavedAttachmentsSection />;
  const attachmentVersion = (item.attachments ?? [])
    .map(({ includeInShare, publicRef, status }) => `${publicRef}:${status}:${includeInShare}`)
    .join(",");
  return (
    <SavedItemAttachmentsSection
      item={item}
      key={`${item.id}:${attachmentVersion}`}
      onOpenShareSettings={onOpenShareSettings}
      onPendingChange={onPendingChange}
      shareAttachmentsEnabled={shareAttachmentsEnabled}
      tripId={tripId}
    />
  );
}
