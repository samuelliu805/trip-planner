import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../../src/features/i18n/i18n-provider";
import { DraftScopeProvider } from "../../../src/features/editing/draft-scope";
import { PersistentUploadControls } from "../../../src/features/attachments/components/persistent-upload-controls";
import { uploadOwner } from "../../../src/features/attachments/upload-owners";
import { DurableOutbox } from "../../../src/features/editing/outbox";
import { registerSyncQueue } from "../../../src/features/editing/sync-registry";
import { PlannerSyncStatus } from "../../../src/features/itinerary/components/planner-sync-status";
import { useDurableFields } from "../../../src/features/editing/use-durable-fields";
import { editingStorageKey } from "../../../src/features/editing/draft-storage";
import { saveApplicationReceipt } from "../../../src/features/research/application-receipt";
const initial = window.__initial;
const scope = ["global", "upload-account-A", initial.tripId, "attachments"];
const parent = new DurableOutbox(
  `trip-planner:upload-fixture-parent:${initial.tripId}`,
  localStorage,
  (op) => op.intent,
  async (input) => {
    const response = await fetch("/parent", { method: "POST", body: JSON.stringify(input) });
    if (!response.ok) throw new Error("Parent creation failed.");
    return response.json();
  },
  (operation) => {
    if (initial.applicationParent)
      saveApplicationReceipt(
        localStorage,
        scope,
        operation.id,
        operation.intent.projection,
        operation.ack.rows,
      );
    queueMicrotask(() => parent.compactAcknowledged());
  },
);
registerSyncQueue({ scope, queue: parent });
void parent.pump();
window.__parent = parent;
function Fields({ actor }) {
  const draft = useDurableFields(
    editingStorageKey(["global", actor, initial.tripId, "fields"], "text"),
    { text: "" },
  );
  return (
    <input
      aria-label="Continuous text"
      value={draft.values.text}
      onChange={(event) => draft.set("text", event.target.value)}
    />
  );
}
function App() {
  const [open, setOpen] = React.useState(true),
    [actor, setActor] = React.useState("upload-account-A");
  return (
    <I18nProvider initialLocale="en">
      <DraftScopeProvider actorId={actor}>
        <PlannerSyncStatus tripId={initial.tripId} mutating={false} />
        <Fields actor={actor} key={actor} />
        <button onClick={() => setOpen(!open)}>Toggle editor</button>
        <button
          onClick={() =>
            setActor(actor === "upload-account-A" ? "upload-account-B" : "upload-account-A")
          }
        >
          Switch account
        </button>
        <button
          onClick={() => {
            const preview = {
              id: initial.entityId,
              day_id: initial.dayId,
              details: { ideaResearchItemId: initial.sourceId, ideaJourneyIndex: 0 },
            };
            parent.enqueue(
              initial.applicationParent ? initial.parentId : initial.entityId,
              [initial.entityId],
              {
                entityId: initial.entityId,
                ...(initial.applicationParent && {
                  kind: "idea.apply",
                  projection: {
                    days: [],
                    items: [preview],
                    removedIds: [],
                    bindings: [
                      { id: preview.id, sourceId: initial.sourceId, index: 0, date: null },
                    ],
                  },
                }),
              },
            );
          }}
        >
          Create entity
        </button>
        <button
          onClick={() =>
            parent.operations
              .filter((op) => op.status === "failed")
              .forEach((op) => parent.retry(op.id))
          }
        >
          Retry parent
        </button>
        {open ? (
          <PersistentUploadControls
            entityId={initial.entityId}
            tripId={initial.tripId}
            target="itinerary"
            sessionId={initial.sessionId}
            parentOperationId={
              initial.newEntity && !initial.applicationParent ? initial.entityId : undefined
            }
          />
        ) : null}
        <button
          onClick={() => {
            window.__owner = uploadOwner(
              ["global", actor, initial.tripId, "attachments"],
              initial.entityId,
              initial.sessionId,
              "itinerary",
            );
          }}
        >
          Inspect owner
        </button>
      </DraftScopeProvider>
    </I18nProvider>
  );
}
createRoot(document.getElementById("fixture")).render(
  <QueryClientProvider client={new QueryClient()}>
    <App />
  </QueryClientProvider>,
);
