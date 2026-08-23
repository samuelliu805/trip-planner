"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  commitAttachmentUploadSession,
  discardAttachmentUploadSession,
} from "@/features/attachments/upload-client";
import type { OwnerAttachment } from "@/features/attachments/schema";

type AttachmentEditSessionOptions = {
  item?: { id: string };
  itemMutationPending: boolean;
  onCancel: () => void;
  targetKind?: "item" | "research";
  tripId: string;
};

export function useAttachmentEditSession({
  item,
  itemMutationPending,
  onCancel,
  targetKind = "item",
  tripId,
}: AttachmentEditSessionOptions) {
  const [attachmentPending, setAttachmentPendingState] = useState(false);
  const [draftCount, setDraftCountState] = useState(0);
  const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
  const [discardPending, setDiscardPending] = useState(false);
  const [error, setError] = useState<string>();
  const [abortController, setAbortController] = useState(() => new AbortController());
  const [uploadSessionId] = useState(() => crypto.randomUUID());
  const abortControllerRef = useRef(abortController);
  const attachmentPendingRef = useRef(false);
  const draftCountRef = useRef(0);
  const sessionHandled = useRef(false);
  const shouldDiscardSession = useRef(false);
  const itemId = item?.id;
  const target = useMemo(
    () => (itemId ? (targetKind === "research" ? { researchItemId: itemId } : { itemId }) : {}),
    [itemId, targetKind],
  );
  const hasUncommittedAttachments = Boolean(itemId && (attachmentPending || draftCount > 0));

  const setAttachmentPending = useCallback(
    (pending: boolean) => {
      attachmentPendingRef.current = pending;
      shouldDiscardSession.current = Boolean(
        !sessionHandled.current && itemId && (pending || draftCountRef.current > 0),
      );
      setAttachmentPendingState(pending);
    },
    [itemId],
  );

  const setDraftCount = useCallback(
    (count: number) => {
      draftCountRef.current = count;
      shouldDiscardSession.current = Boolean(
        !sessionHandled.current && itemId && (attachmentPendingRef.current || count > 0),
      );
      setDraftCountState(count);
    },
    [itemId],
  );

  const requestCancel = useCallback(() => {
    if (itemMutationPending || discardPending) return;
    if (hasUncommittedAttachments) {
      setDiscardDialogOpen(true);
      return;
    }
    onCancel();
  }, [discardPending, hasUncommittedAttachments, itemMutationPending, onCancel]);

  useEffect(() => {
    if (!hasUncommittedAttachments) return;
    const confirmNavigation = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", confirmNavigation);
    return () => window.removeEventListener("beforeunload", confirmNavigation);
  }, [hasUncommittedAttachments]);

  useEffect(
    () => () => {
      if (!itemId || !shouldDiscardSession.current) return;
      abortControllerRef.current.abort();
      void discardAttachmentUploadSession({ ...target, tripId, uploadSessionId }, true).catch(
        () => undefined,
      );
    },
    [itemId, target, tripId, uploadSessionId],
  );

  const commit = useCallback(
    async <SavedItem extends { id: string }>(savedItem: SavedItem) => {
      if (!itemId || draftCount === 0) {
        sessionHandled.current = true;
        shouldDiscardSession.current = false;
        return savedItem;
      }
      const attachments = await commitAttachmentUploadSession({
        ...target,
        tripId,
        uploadSessionId,
      });
      sessionHandled.current = true;
      shouldDiscardSession.current = false;
      return { ...savedItem, attachments } as SavedItem & { attachments: OwnerAttachment[] };
    },
    [draftCount, itemId, target, tripId, uploadSessionId],
  );

  const markHandled = useCallback(() => {
    sessionHandled.current = true;
    shouldDiscardSession.current = false;
  }, []);

  const discard = useCallback(async () => {
    if (!itemId) return;
    setDiscardPending(true);
    setError(undefined);
    abortController.abort();
    try {
      await discardAttachmentUploadSession({
        ...target,
        tripId,
        uploadSessionId,
      });
      sessionHandled.current = true;
      shouldDiscardSession.current = false;
      setDiscardDialogOpen(false);
      onCancel();
    } catch (discardError) {
      setError(
        discardError instanceof Error
          ? discardError.message
          : "The unused attachments could not be removed.",
      );
      const nextController = new AbortController();
      abortControllerRef.current = nextController;
      setAbortController(nextController);
    } finally {
      setDiscardPending(false);
    }
  }, [abortController, itemId, onCancel, target, tripId, uploadSessionId]);

  return {
    attachmentPending,
    commit,
    discard,
    discardDialogOpen,
    discardPending,
    draftCount,
    error,
    markHandled,
    requestCancel,
    setAttachmentPending,
    setDiscardDialogOpen,
    setDraftCount,
    uploadSessionId,
    uploadSessionSignal: abortController.signal,
  };
}
