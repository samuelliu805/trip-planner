"use client";

import { useRef } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { EditorState } from "@/features/itinerary/components/planner-config";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
import { usePlannerEditorViewportLock } from "@/features/itinerary/components/use-planner-editor-viewport-lock";
import type { ItineraryItem, TransportMode } from "@/features/itinerary/types";

/** A dedicated full-screen editor that never shares its viewport with the Matrix. */
export function PlannerItemEditorDialog({
  defaultCurrency,
  dayDate,
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
  dayDate: string;
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
  const editorOpen = Boolean(editor);
  usePlannerEditorViewportLock(editorOpen);

  const form = editor ? (
    <PlannerItemForm
      dayDate={dayDate}
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

  return (
    <Sheet onOpenChange={(open) => !open && closeRequest.current()} open={editorOpen}>
      <SheetContent
        className="planner-item-dialog p-0"
        overlayClassName="bg-background"
        showCloseButton={false}
        side="right"
      >
        {form}
      </SheetContent>
    </Sheet>
  );
}
