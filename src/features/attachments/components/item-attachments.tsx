"use client";

import type { ItineraryItem } from "@/features/itinerary/types";
import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";
import { usePlannerPersistence } from "@/features/itinerary/planner-persistence";

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
  const persistence = usePlannerPersistence();
  if (!item) return <UnsavedAttachmentsSection />;
  if (persistence)
    return (
      <section className="min-w-0 space-y-3 border-t pt-4" data-guest-attachment-gate="">
        <div className="rounded-lg border border-dashed bg-muted/30 p-4">
          <p className="text-sm font-semibold">
            <T message={" Save this trip to an account to add files. "} />
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            <T message={" Your local itinerary will stay on this device while you sign in. "} />
          </p>
          <Button
            className="mt-3 min-h-11"
            onClick={() => persistence.requestAccountFeature("attachment", item.id)}
            type="button"
          >
            <T message={"Save to account"} />
          </Button>
        </div>
      </section>
    );
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
