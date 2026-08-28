import { LoaderCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { T } from "@/features/i18n/i18n-provider";

export function AttachmentDeleteDialog({
  fileName,
  onConfirm,
  onOpenChange,
  open,
  pending,
  target,
}: {
  fileName?: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pending: boolean;
  target: "itinerary" | "research";
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent data-attachment-overlay="">
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T message={"Delete this attachment?"} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T message={" This removes “"} />
            {fileName}
            <T
              message={
                target === "itinerary"
                  ? "” from this itinerary item and its shared page. A deduplicated copy remains only if another item still uses it. "
                  : "” from this idea. Files already applied to the Plan are not changed until you Apply again. "
              }
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            <T message={"Cancel"} />
          </AlertDialogCancel>
          <AlertDialogAction disabled={pending} onClick={onConfirm}>
            {pending ? <LoaderCircle className="size-4 animate-spin" /> : null}
            <T message={" Delete attachment "} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
