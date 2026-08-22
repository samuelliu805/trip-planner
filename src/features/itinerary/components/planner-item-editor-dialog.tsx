"use client";

import { useRef, useState } from "react";

import type { EditorState } from "@/features/itinerary/components/planner-config";
import { PlannerEditorScreen } from "@/features/itinerary/components/planner-editor-screen";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
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
  const [creationSequence, setCreationSequence] = useState(0);
  const editorOpen = Boolean(editor);

  const form = editor ? (
    <PlannerItemForm
      dayDate={dayDate}
      dayId={editor.dayId}
      dayItems={dayItems}
      defaultCurrency={defaultCurrency}
      item={editor.item}
      key={`${editor.dayId}:${editor.item?.id ?? `new-${creationSequence}`}:${editor.type}`}
      onCancel={onClose}
      onCloseRequestRegistration={(handler) => {
        closeRequest.current = handler ?? onClose;
      }}
      onError={onError}
      onCreateAnother={() => setCreationSequence((sequence) => sequence + 1)}
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
    <PlannerEditorScreen onOpenChange={(open) => !open && closeRequest.current()} open={editorOpen}>
      {form}
    </PlannerEditorScreen>
  );
}
