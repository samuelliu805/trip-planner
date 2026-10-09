"use client";
import { useEffect, useRef, useState } from "react";
import type { OwnerAttachment } from "../schema";

/** Viewer state follows the file collection, independently of the entity's text. */
export function useAttachmentCollection(item: {
  version: number;
  attachments_version?: number;
  attachments?: OwnerAttachment[];
}) {
  const [attachments, setAttachments] = useState(item.attachments ?? []);
  const [version, setVersion] = useState(item.version);
  const collectionVersion = useRef(item.attachments_version ?? 0);
  function confirm(
    files: OwnerAttachment[] & { attachmentsVersion?: number },
    entityVersion?: number,
    filesVersion = files.attachmentsVersion,
  ) {
    if (entityVersion !== undefined) setVersion((before) => Math.max(before, entityVersion));
    if ((filesVersion ?? 0) < collectionVersion.current) return;
    collectionVersion.current = filesVersion ?? 0;
    setAttachments(files);
  }
  useEffect(() => {
    queueMicrotask(() => confirm(item.attachments ?? [], item.version, item.attachments_version));
    // Entity props are a confirmed collection snapshot, never a pending file mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.attachments, item.attachments_version, item.version]);
  return { attachments, version, confirm };
}
