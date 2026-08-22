"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { DockedFieldEditor } from "@/components/ui/docked-field-editor";
import { renameTrip } from "@/features/trips/actions";

/**
 * Renaming never opens a form. One field docks above the keyboard instead, so iPadOS has no covered
 * field to reveal and the plan behind it never moves.
 */
export function TripRenameDock({
  onClose,
  title,
  tripId,
}: {
  onClose: () => void;
  title: string;
  tripId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, startRename] = useTransition();

  return (
    <DockedFieldEditor
      busy={pending}
      error={error}
      label="Trip name"
      maxLength={120}
      onCancel={onClose}
      onSubmit={(next) =>
        startRename(async () => {
          const result = await renameTrip({ title: next, tripId });
          if (result.error) {
            setError(result.error);
            return;
          }
          router.refresh();
          onClose();
        })
      }
      value={title}
    />
  );
}
