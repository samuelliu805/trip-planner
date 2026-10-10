import React from "react";
import { SavedItemAttachmentsSection } from "../../../src/features/attachments/components/item-attachments-section";
import { useBackgroundActions } from "../../../src/features/editing/use-background-actions";
export function AttachmentProbe({ workspace }) {
  const item = workspace.days[0].items[0];
  const owner = useBackgroundActions(workspace.variant.trip_id, `attachments:${item.id}`);
  React.useEffect(() => {
    window.__attachmentActions = owner;
  }, [owner]);
  return (
    <section data-attachment-probe>
      <SavedItemAttachmentsSection
        item={item}
        tripId={item.trip_id}
        uploadSessionId="00000000-0000-4000-8000-000000000081"
        uploadSessionSignal={new AbortController().signal}
        onOpenShareSettings={() => {}}
        shareAttachmentsEnabled
      />
      <button onClick={() => owner?.queue.retry(owner.queue.operations[0]?.id)}>
        Retry attachment mutation
      </button>
    </section>
  );
}
