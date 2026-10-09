import type { OwnerAttachment } from "./schema";
type HasAttachments = { attachments?: OwnerAttachment[]; attachments_version?: number };
/** Text and file collections have independent monotonic versions. */
export function mergeAttachmentCollection<T extends HasAttachments>(current: T, incoming: T): T {
  const source =
    (incoming.attachments_version ?? 0) >= (current.attachments_version ?? 0) ? incoming : current;
  return {
    ...incoming,
    attachments: source.attachments,
    attachments_version: source.attachments_version,
  };
}
