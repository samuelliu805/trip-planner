"use client";

import { AttachmentSessionDiscardDialog } from "@/features/itinerary/components/attachment-session-discard-dialog";
import type { PlannerEditorSaveIntent } from "@/features/itinerary/components/planner-editor-form";
import { PlannerItemExitDialog } from "@/features/itinerary/components/planner-item-exit-dialog";
import { PlannerItemSaveConfirmation } from "@/features/itinerary/components/planner-item-save-confirmation";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";

export function PlannerItemFormDialogs({
  attachmentSession,
  editing,
  exitOpen,
  itemLabel,
  itemTitle,
  onExit,
  onExitOpenChange,
  onSaveConfirm,
  onSaveConfirmationOpenChange,
  saveIntent,
}: {
  attachmentSession: ReturnType<typeof useAttachmentEditSession>;
  editing: boolean;
  exitOpen: boolean;
  itemLabel: string;
  itemTitle: string;
  onExit: () => void;
  onExitOpenChange: (open: boolean) => void;
  onSaveConfirm: () => void;
  onSaveConfirmationOpenChange: (open: boolean) => void;
  saveIntent: PlannerEditorSaveIntent | null;
}) {
  return (
    <>
      <AttachmentSessionDiscardDialog
        error={attachmentSession.error}
        onDiscard={attachmentSession.discard}
        onOpenChange={attachmentSession.setDiscardDialogOpen}
        open={attachmentSession.discardDialogOpen}
        pending={attachmentSession.discardPending}
        uploadPending={attachmentSession.attachmentPending}
      />
      <PlannerItemExitDialog
        editing={editing}
        onDiscard={onExit}
        onOpenChange={onExitOpenChange}
        open={exitOpen}
      />
      <PlannerItemSaveConfirmation
        intent={saveIntent}
        itemLabel={itemLabel}
        itemTitle={itemTitle}
        onConfirm={onSaveConfirm}
        onOpenChange={onSaveConfirmationOpenChange}
      />
    </>
  );
}
