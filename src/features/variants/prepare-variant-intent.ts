import { SyncFailure, type OutboxOperation } from "../editing/outbox";
import { loadPlannerWorkspace } from "../itinerary/actions";
import type { PlannerVariant } from "../itinerary/types";
import { loadRouteVariants } from "./actions";
import { sourceSnapshot, sourceSnapshotDifferences, variantFields } from "./source-snapshot";
import type { VariantSyncIntent } from "./sync-intent";

/** Reads and rebasing happen before the first wire is frozen; replay never calls this. */
export async function prepareVariantIntent(
  operation: OutboxOperation,
  tripId: string,
  confirmed: PlannerVariant[],
) {
  const intent = structuredClone(operation.intent) as unknown as VariantSyncIntent;
  let variants: PlannerVariant[] | undefined;
  if (intent.kind === "create") {
    const loaded = await loadPlannerWorkspace(tripId, intent.input.sourceVariantId);
    if (!loaded.data || sourceSnapshot(loaded.data) !== sourceSnapshot(intent.source))
      throw new SyncFailure(
        "The source Plan changed. Your copy request is kept for review. " +
          (loaded.data
            ? sourceSnapshotDifferences(intent.source, loaded.data).join(", ").slice(0, 160)
            : "Source unavailable."),
        "conflict",
      );
    const source = loaded.data.variant;
    Object.assign(intent.input, {
      expectedSourceVersion: source.version,
      expectedSourceContentVersion: source.content_version,
      expectedSourceDaysVersion: source.days_version,
      expectedSourceItemsVersion: source.items_version,
    });
  } else if (intent.kind === "primary" || intent.kind === "delete") {
    const loaded = await loadRouteVariants(tripId);
    if (!loaded.data)
      throw new SyncFailure(loaded.error ?? "The latest Plans could not be loaded.");
    variants = loaded.data;
    const current = variants.find((row) => row.id === intent.input.variantId);
    if (
      !current ||
      (intent.kind === "primary" && intent.before && variantFields(current) !== intent.before)
    )
      throw new SyncFailure("The Plan changed elsewhere. Your request is kept.", "conflict");
    if (
      intent.kind === "delete" &&
      (current.is_primary ||
        current.content_version !== intent.input.expectedContentVersion ||
        current.days_version !== intent.input.expectedDaysVersion ||
        current.items_version !== intent.input.expectedItemsVersion)
    )
      throw new SyncFailure(
        "The Plan content changed. Your delete request is kept for review.",
        "conflict",
      );
    // A rename may change metadata while identity and destructive content guards remain intact.
    intent.input.expectedVersion = current.version;
  } else if (intent.before) {
    const current = confirmed.find((row) => row.id === intent.input.variantId);
    if (!current || variantFields(current) !== intent.before)
      throw new SyncFailure("The Plan changed elsewhere. Your edit is kept.", "conflict");
    intent.input.expectedVersion = current.version;
  }
  return { intent, variants };
}
