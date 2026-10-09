"use client";
import { useEffect, useRef } from "react";
import { useBackgroundActions } from "@/features/editing/use-background-actions";
import type { OwnerAttachment } from "../schema";
import { newTelemetryOperationId } from "@/lib/telemetry/product";
export function useAttachmentMutations(
  tripId: string,
  entityId: string,
  target: "itinerary" | "research",
  onConfirmed: (files: OwnerAttachment[], version: number, attachmentsVersion: number) => void,
) {
  const owner = useBackgroundActions(tripId, `attachments:${entityId}`),
    handled = useRef(new Set<string>());
  const completed = owner?.completed ?? [];
  useEffect(() => {
    const fresh = completed.filter(
      (row) =>
        !handled.current.has(row.id) &&
        row.intent.kind === "attachment.mutate" &&
        row.intent.input.entityId === entityId,
    );
    fresh.forEach((row) => handled.current.add(row.id));
    const latest = fresh.at(-1);
    if (latest) {
      const result = latest.result as {
        data: { attachments: OwnerAttachment[]; version: number; attachmentsVersion: number };
      };
      onConfirmed(result.data.attachments, result.data.version, result.data.attachmentsVersion);
    }
    // The task retains the entity and file identity after the viewer closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed.length, entityId]);
  function accept(
    file: OwnerAttachment,
    action: "share" | "delete",
    includeInShare: boolean | null,
    version: number | null,
  ) {
    if (!owner) throw new Error("Local storage is unavailable.");
    return owner.accept({
      kind: "attachment.mutate",
      input: {
        tripId,
        entityId,
        target,
        action,
        operationId: newTelemetryOperationId(),
        publicRef: file.publicRef,
        expectedLinkVersion: file.version,
        expectedResearchVersion: version,
        includeInShare,
      },
    });
  }
  const operations = owner?.queue.operations ?? [];
  return {
    accept,
    error: operations.find((op) => op.error)?.error,
    pending: (ref: string) =>
      operations.some(
        (op) => (op.intent as { input: { publicRef: string } }).input.publicRef === ref,
      ),
    requestedShare: (file: OwnerAttachment) => {
      const op = operations
        .filter((op) => {
          const intent = op.intent as { input: { action: string; publicRef: string } };
          return intent.input.action === "share" && intent.input.publicRef === file.publicRef;
        })
        .at(-1);
      return op
        ? (op.intent as { input: { includeInShare: boolean } }).input.includeInShare
        : file.includeInShare;
    },
  };
}
