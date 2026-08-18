"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  commitAttachmentUploadSession,
  discardAttachmentUploadSession,
} from "@/features/attachments/upload-client";
import type { ItineraryItem } from "@/features/itinerary/types";

type AttachmentEditSessionOptions = {
  item?: ItineraryItem;
  itemMutationPending: boolean;
  onCancel: () => void;
  onCloseRequestRegistration?: (handler: (() => void) | null) => void;
  tripId: string;
};

export function useAttachmentEditSession({
  item,
  itemMutationPending,
  onCancel,
  onCloseRequestRegistration,
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
    onCloseRequestRegistration?.(requestCancel);
    return () => onCloseRequestRegistration?.(null);
  }, [onCloseRequestRegistration, requestCancel]);

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
      void discardAttachmentUploadSession({ itemId, tripId, uploadSessionId }, true).catch(
        () => undefined,
      );
    },
    [itemId, tripId, uploadSessionId],
  );

  const commit = useCallback(
    async (savedItem: ItineraryItem) => {
      if (!itemId || draftCount === 0) {
        sessionHandled.current = true;
        shouldDiscardSession.current = false;
        return savedItem;
      }
      const attachments = await commitAttachmentUploadSession({
        itemId,
        tripId,
        uploadSessionId,
      });
      sessionHandled.current = true;
      shouldDiscardSession.current = false;
      return { ...savedItem, attachments };
    },
    [draftCount, itemId, tripId, uploadSessionId],
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
        itemId,
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
  }, [abortController, itemId, onCancel, tripId, uploadSessionId]);

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
