"use client";

import { AttachmentSessionDiscardDialog } from "@/features/itinerary/components/attachment-session-discard-dialog";
import { PlannerItemExitDialog } from "@/features/itinerary/components/planner-item-exit-dialog";
import { useAttachmentEditSession } from "@/features/itinerary/components/use-attachment-edit-session";

export function PlannerItemFormDialogs({
  attachmentSession,
  editing,
  exitOpen,
  onExit,
  onExitOpenChange,
}: {
  attachmentSession: ReturnType<typeof useAttachmentEditSession>;
  editing: boolean;
  exitOpen: boolean;
  onExit: () => void;
  onExitOpenChange: (open: boolean) => void;
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
    </>
  );
}
