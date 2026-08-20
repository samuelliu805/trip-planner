"use client";

import { useRef, useSyncExternalStore } from "react";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { EditorState } from "@/features/itinerary/components/planner-config";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
import type { ItineraryItem, TransportMode } from "@/features/itinerary/types";

const editorMedia = "(max-width: 1199px)";

function subscribeToEditorSurface(onChange: () => void) {
  const media = window.matchMedia(editorMedia);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useFullScreenEditor() {
  return useSyncExternalStore(
    subscribeToEditorSurface,
    () => window.matchMedia(editorMedia).matches,
    () => true,
  );
}

/** A side-entering full-screen editor on touch widths and a centred dialog on desktop. */
export function PlannerItemEditorDialog({
  defaultCurrency,
  dayItems,
  editor,
  onClose,
  onDraftChange,
  onError,
  shareAttachmentsEnabled,
  tripId,
  unavailableTransportModes,
  variantId,
}: {
  defaultCurrency: string;
  dayItems: ItineraryItem[];
  editor: EditorState | null;
  onClose: () => void;
  onDraftChange: (item: ItineraryItem | null) => void;
  onError: (message?: string) => void;
  shareAttachmentsEnabled: boolean;
  tripId: string;
  unavailableTransportModes: TransportMode[];
  variantId: string;
}) {
  const closeRequest = useRef(onClose);
  const fullScreen = useFullScreenEditor();
  const form = editor ? (
    <PlannerItemForm
      dayId={editor.dayId}
      dayItems={dayItems}
      defaultCurrency={defaultCurrency}
      item={editor.item}
      key={`${editor.dayId}:${editor.item?.id ?? "new"}:${editor.type}`}
      onCancel={onClose}
      onCloseRequestRegistration={(handler) => {
        closeRequest.current = handler ?? onClose;
      }}
      onError={onError}
      onDraftChange={editor.item ? onDraftChange : undefined}
      onSaved={onClose}
      shareAttachmentsEnabled={shareAttachmentsEnabled}
      tripId={tripId}
      type={editor.type}
      unavailableTransportModes={unavailableTransportModes}
      variantId={variantId}
    />
  ) : null;

  if (fullScreen)
    return (
      <Sheet onOpenChange={(open) => !open && closeRequest.current()} open={Boolean(editor)}>
        <SheetContent className="planner-item-dialog p-0" side="right">
          {form}
        </SheetContent>
      </Sheet>
    );

  return (
    <Dialog onOpenChange={(open) => !open && closeRequest.current()} open={Boolean(editor)}>
      <DialogContent className="planner-item-dialog flex flex-col overflow-hidden p-0">
        {form}
      </DialogContent>
    </Dialog>
  );
}
