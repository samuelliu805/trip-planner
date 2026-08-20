"use client";

import { useEffect, useRef } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { EditorState } from "@/features/itinerary/components/planner-config";
import { PlannerItemForm } from "@/features/itinerary/components/planner-item-form";
import type { ItineraryItem, TransportMode } from "@/features/itinerary/types";

/** A dedicated full-screen editor that never shares its viewport with the Matrix. */
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
  const editorOpen = Boolean(editor);

  useEffect(() => {
    if (!editorOpen) return;
    const root = document.documentElement;
    const body = document.body;
    let frame = 0;
    const resetLayoutScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
        document.scrollingElement?.scrollTo(0, 0);
      });
    };

    root.classList.add("planner-editor-viewport-locked");
    body.classList.add("planner-editor-viewport-locked");
    resetLayoutScroll();
    window.addEventListener("scroll", resetLayoutScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", resetLayoutScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", resetLayoutScroll);
      window.visualViewport?.removeEventListener("resize", resetLayoutScroll);
      root.classList.remove("planner-editor-viewport-locked");
      body.classList.remove("planner-editor-viewport-locked");
      window.scrollTo(0, 0);
    };
  }, [editorOpen]);

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
