"use client";

import { useRef } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { EditorState } from "@/features/itinerary/components/planner-config";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
import type { ItineraryItem, TransportMode } from "@/features/itinerary/types";

/**
 * One centred modal on tablet and desktop, one full-height sheet on phones. The editor never
 * shares the screen with the workspace side panel, so the Matrix stays fully visible behind it.
 */
export function PlannerItemEditorDialog({
  defaultCurrency,
  editor,
  onClose,
  onDraftChange,
  onError,
  onPlaceItem,
  shareAttachmentsEnabled,
  tripId,
  unavailableTransportModes,
  variantId,
}: {
  defaultCurrency: string;
  editor: EditorState | null;
  onClose: () => void;
  onDraftChange: (item: ItineraryItem | null) => void;
  onError: (message?: string) => void;
  onPlaceItem: (item: ItineraryItem) => void;
  shareAttachmentsEnabled: boolean;
  tripId: string;
  unavailableTransportModes: TransportMode[];
  variantId: string;
}) {
  const closeRequest = useRef(onClose);
  return (
    <Dialog onOpenChange={(open) => !open && closeRequest.current()} open={Boolean(editor)}>
      <DialogContent className="planner-item-dialog flex flex-col overflow-hidden p-0">
        {editor ? (
          <PlannerItemForm
            dayId={editor.dayId}
            defaultCurrency={defaultCurrency}
            item={editor.item}
            key={`${editor.dayId}:${editor.item?.id ?? "new"}:${editor.type}`}
            onCancel={onClose}
            onCloseRequestRegistration={(handler) => {
              closeRequest.current = handler ?? onClose;
            }}
            onError={onError}
            onDraftChange={editor.item ? onDraftChange : undefined}
            onSaved={(savedItem, { place }) => {
              onClose();
              if (place) onPlaceItem(savedItem);
            }}
            shareAttachmentsEnabled={shareAttachmentsEnabled}
            tripId={tripId}
            type={editor.type}
            unavailableTransportModes={unavailableTransportModes}
            variantId={variantId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
