import { backgroundActionSchema } from "../editing/background-action-intent";
import { SyncFailure, type OutboxOperation } from "../editing/outbox";
import { researchEditableSnapshot } from "./editable-snapshot";
import type { ResearchItem } from "./types";

/** Only equal accepted fields may bind to a durable source predecessor's confirmed version. */
export function resolveOwnedSourceReceipts(op: OutboxOperation, scope: string[], storage: Storage) {
  const intent = backgroundActionSchema.parse(structuredClone(op.intent));
  if ((intent.kind !== "idea.apply" && intent.kind !== "booking.apply") || !intent.sourceBefore)
    return op;
  const checkpoint = JSON.parse(
    storage.getItem(
      `trip-planner:ideas-baseline:v1:${JSON.stringify([...scope.slice(0, 3), "ideas"])}`,
    ) ?? "null",
  ) as { items?: ResearchItem[] } | null;
  for (const [id, before] of Object.entries(intent.sourceBefore)) {
    const source = checkpoint?.items?.find((source) => source.id === id);
    if (
      !source ||
      !Number.isInteger(source.version) ||
      source.version < 1 ||
      researchEditableSnapshot(source) !== before
    )
      throw new SyncFailure(
        "The source Idea changed. Your request is kept for review.",
        "conflict",
      );
    if (intent.kind === "idea.apply") intent.input.expectedResearchVersions[id] = source.version;
    else intent.input.expectedVersion = source.version;
  }
  return { ...op, intent: JSON.parse(JSON.stringify(intent)) };
}
