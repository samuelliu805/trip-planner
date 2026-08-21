"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";

import {
  encodePlannerClipboard,
  parsePlannerClipboard,
  type PlannerClipboard,
} from "@/features/itinerary/grid-interactions";

/**
 * React replays events from portalled overlays through this subtree, so an edit inside the item
 * editor would otherwise reach the Matrix. Typing surfaces and overlays keep their own clipboard.
 */
function editableTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element?.closest?.(
      "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='dialog'], [role='alertdialog']",
    ),
  );
}

export function PlannerWorkspaceEventBoundary({
  children,
  clipboardPayload,
  internalClipboard,
  onClearRequest,
  pastePayload,
  selectedItemCount,
  setInteractionError,
  setInternalClipboard,
}: {
  children: ReactNode;
  clipboardPayload: () => PlannerClipboard | null;
  internalClipboard: PlannerClipboard | null;
  onClearRequest: () => void;
  pastePayload: (payload: PlannerClipboard) => Promise<void>;
  selectedItemCount: number;
  setInteractionError: Dispatch<SetStateAction<string | undefined>>;
  setInternalClipboard: Dispatch<SetStateAction<PlannerClipboard | null>>;
}) {
  return (
    <div
      className="planner-workspace flex h-full min-h-0 flex-col overflow-hidden bg-background"
      onKeyDown={(event) => {
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          (event.target as HTMLElement).closest("[role='gridcell']") &&
          selectedItemCount > 0
        ) {
          event.preventDefault();
          onClearRequest();
        }
      }}
      onCopy={(event) => {
        if (editableTarget(event.target)) return;
        const payload = clipboardPayload();
        if (payload) {
          event.preventDefault();
          event.clipboardData.setData("text/plain", encodePlannerClipboard(payload));
          setInternalClipboard(payload);
          setInteractionError(undefined);
        }
      }}
      onPaste={(event) => {
        if (editableTarget(event.target)) return;
        const payload =
          parsePlannerClipboard(event.clipboardData.getData("text/plain")) ?? internalClipboard;
        if (!payload) {
          setInteractionError(
            "Unsupported clipboard data. Copy cells from this planner before pasting.",
          );
          return;
        }
        event.preventDefault();
        void pastePayload(payload);
      }}
    >
      {children}
    </div>
  );
}
