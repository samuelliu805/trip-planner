import { SyncFailure, type OutboxOperation } from "../editing/outbox";
import { hasScopeReceipt } from "../editing/dependency-receipts";
import { loadPlannerWorkspace } from "./actions";
import { itemEditableSnapshot } from "./item-editable-snapshot";
import type { PlannerSyncIntent } from "./sync-operation";

/** An owned no-op may confirm the previous row version; bind only its captured children. */
export async function prepareCopySourceParents(
  operation: OutboxOperation,
  scope: string[],
  storage: Storage,
) {
  const intent = structuredClone(operation.intent) as unknown as PlannerSyncIntent;
  if (intent.kind !== "copy" || !intent.sourceParents) return operation;
  const variants = new Set(
    intent.sources
      .filter(
        (source) => source.variant_id !== scope[3] && intent.sourceParents?.[source.id]?.length,
      )
      .map((source) => source.variant_id),
  );
  for (const variantId of variants) {
    const loaded = await loadPlannerWorkspace(scope[2], variantId);
    if (!loaded.data)
      throw new SyncFailure(loaded.error ?? "The copied source could not be verified.");
    for (const [index, source] of intent.sources.entries()) {
      const parents = intent.sourceParents[source.id];
      if (source.variant_id !== variantId || !parents?.length) continue;
      const current = loaded.data.days
        .flatMap((day) => day.items)
        .find((item) => item.id === source.id);
      if (
        !parents.every((id) => hasScopeReceipt(storage, scope, id)) ||
        !current ||
        itemEditableSnapshot(current) !== itemEditableSnapshot(source)
      )
        throw new SyncFailure(
          "A copied source item changed elsewhere. Your local copy is kept.",
          "conflict",
        );
      intent.input.sourceVersions[index] = current.version;
    }
  }
  return { ...operation, intent: JSON.parse(JSON.stringify(intent)) as OutboxOperation["intent"] };
}
