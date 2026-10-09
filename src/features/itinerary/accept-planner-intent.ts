import { DurableOutbox } from "../editing/outbox";
import { dayIds, dayEditSnapshot, isStructureIntent } from "./structure-sync";
import { intentItemIds, type PlannerSyncIntent } from "./sync-operation";
import type { PlannerWorkspace } from "./types";
import {
  createItineraryItemSchema,
  updateItineraryItemSchema,
  deleteItineraryItemSchema,
} from "./item-schema";
import {
  clearItineraryItemsSchema,
  reorderItineraryItemsSchema,
  insertTripDaySchema,
  removeTripDaySchema,
  reorderVariantDaysSchema,
  copyItineraryItemsSchema,
} from "./day-schema";
import { canonicalActivityOrderIds } from "./activity-order";
import { tripSyncQueues } from "../editing/sync-registry";
import { itemEditableSnapshot } from "./item-editable-snapshot";
import type { ApplicationProjection } from "../research/application-projection";
import { bindApplicationProjectionParents } from "../research/application-projection-parents";
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
type AcceptedPlannerContext = {
  scope: string[];
  storage: Storage;
  checkpointKey: string;
  confirmed: PlannerWorkspace;
  tripId: string;
  variantId: string;
  queue: DurableOutbox;
  project: () => PlannerWorkspace;
  publish: () => void;
};
export function acceptPlannerIntent(context: AcceptedPlannerContext, intent: PlannerSyncIntent) {
  if (!context.storage.getItem(context.checkpointKey))
    context.storage.setItem(context.checkpointKey, JSON.stringify(context.confirmed));
  const schema =
    intent.kind === "create"
      ? createItineraryItemSchema
      : intent.kind === "update"
        ? updateItineraryItemSchema
        : intent.kind === "delete"
          ? deleteItineraryItemSchema
          : intent.kind === "clear"
            ? clearItineraryItemsSchema
            : intent.kind === "insertDay"
              ? insertTripDaySchema
              : intent.kind === "removeDay"
                ? removeTripDaySchema
                : intent.kind === "reorderDays"
                  ? reorderVariantDaysSchema
                  : intent.kind === "copy"
                    ? copyItineraryItemsSchema
                    : reorderItineraryItemsSchema;
  const validation = schema.safeParse(intent.input);
  if (!validation.success)
    throw new Error(validation.error.issues[0]?.message ?? "This edit is incomplete.");
  const workspace = context.project();
  if (
    intent.kind === "reorder" ||
    (intent.kind === "update" && intent.input.insertAfterItemId !== undefined)
  )
    intent.beforeOrder = canonicalActivityOrderIds(
      workspace.days.find(({ id }) => id === intent.input.dayId)?.items ?? [],
    );
  if (intent.kind === "insertDay") intent.input.stableIdentity = true;
  if (isStructureIntent(intent) && intent.kind !== "copy") intent.beforeDays = dayIds(workspace);
  const ids = intentItemIds(intent);
  const dependencies = context.queue.operations
    .filter(
      (operation) =>
        operation.status !== "acknowledged" &&
        intentItemIds(operation.intent as unknown as PlannerSyncIntent).some((id) =>
          ids.includes(id),
        ),
    )
    .map(({ id }) => id);
  const planParent = `trip-planner:variants-outbox:v1:${JSON.stringify([context.scope[0], context.scope[1], context.scope[2], "variants"])}:${context.variantId}`;
  if (context.storage.getItem(planParent)) dependencies.push(context.variantId);
  for (const entry of tripSyncQueues(context.scope)) {
    if (entry.queue === context.queue) continue;
    for (const op of entry.queue.operations.filter((op) => op.status !== "acknowledged")) {
      if (
        intent.kind === "copy" &&
        intent.sources.some(
          (source) =>
            source.variant_id === entry.scope[3] && source.variant_id !== context.variantId,
        ) &&
        intentItemIds(op.intent as unknown as PlannerSyncIntent).some((id) =>
          intent.input.sourceItemIds.includes(id),
        )
      ) {
        dependencies.push(op.id);
        if (intent.kind === "copy") {
          const ids = intentItemIds(op.intent as unknown as PlannerSyncIntent);
          for (const source of intent.sources.filter(
            (source) => source.variant_id === entry.scope[3] && ids.includes(source.id),
          )) {
            intent.sourceParents ??= {};
            (intent.sourceParents[source.id] ??= []).push(op.id);
          }
        }
      }
      const action = op.intent as {
        kind: string;
        input: { variantId?: string };
        variantId?: string;
        projection?: ApplicationProjection;
        applicationParents?: string[];
      };
      const projection = action.projection
        ? bindApplicationProjectionParents(
            action.projection,
            action.applicationParents ?? op.dependsOn,
            context.scope,
            context.storage,
          )
        : undefined;
      const affectedDayId = "dayId" in intent.input ? intent.input.dayId : undefined;
      const affected =
        !projection ||
        isStructureIntent(intent) ||
        ids.some(
          (id) =>
            projection.items.some((item) => item.id === id) || projection.removedIds.includes(id),
        ) ||
        (affectedDayId &&
          projection.days.some(
            (day) =>
              day.id === affectedDayId &&
              !context.confirmed.days.some(
                (before) => before.id === day.id && before.date === day.date,
              ),
          )) ||
        (intent.kind === "reorder" &&
          projection.items.some((item) => item.day_id === intent.input.dayId));
      if (
        ["idea.apply", "booking.apply", "booking.revert"].includes(action.kind) &&
        ((action.input.variantId ?? action.variantId) === context.variantId ||
          (intent.kind === "copy" &&
            intent.sources.some(
              (source) => source.variant_id === (action.input.variantId ?? action.variantId),
            ))) &&
        affected
      )
        dependencies.push(op.id);
    }
  }
  const targetDayId =
    intent.kind === "copy"
      ? intent.input.targetDayId
      : "dayId" in intent.input
        ? intent.input.dayId
        : undefined;
  for (const operation of context.queue.operations.filter((op) => op.status !== "acknowledged")) {
    const pending = operation.intent as unknown as PlannerSyncIntent;
    const structure = isStructureIntent(intent) && intent.kind !== "copy";
    if (
      (pending.kind === "insertDay" && pending.input.operationId === targetDayId) ||
      (structure && isStructureIntent(pending) && pending.kind !== "copy") ||
      (intent.kind === "removeDay" && operation.resources.includes(intent.input.dayId)) ||
      (intent.kind === "clear" &&
        intent.input.itemIds.some((id) => intentItemIds(pending).includes(id)))
    ) {
      if (!dependencies.includes(operation.id)) dependencies.push(operation.id);
    }
  }
  if (intent.kind === "removeDay") {
    if (workspace.days.length <= 1) throw new Error("The last day cannot be removed.");
    intent.beforeDay = dayEditSnapshot(workspace, intent.input.dayId);
    intent.followsLocal = dependencies.length > 0;
  }
  if (intent.kind === "clear" && dependencies.length) {
    intent.followsLocal = true;
    intent.beforeItems = Object.fromEntries(
      workspace.days
        .flatMap((day) => day.items)
        .filter((item) => intent.input.itemIds.includes(item.id))
        .map((item) => [item.id, itemEditableSnapshot(item)]),
    );
  }
  if (intent.kind === "update" || intent.kind === "delete") {
    const item = workspace.days
      .flatMap(({ items }) => items)
      .find(({ id }) => id === intent.input.id);
    if (!item) throw new Error("This item is no longer available. The local draft is kept.");
    // Successive local revisions depend on their predecessor, whose projected version is stable.
    if (dependencies.length) {
      intent.input.expectedVersion = item.version;
      intent.followsLocal = true;
      intent.beforeItem = itemEditableSnapshot(item);
    }
  }
  const dayId = "dayId" in intent.input ? intent.input.dayId : undefined;
  const sourceDay =
    intent.kind === "update" || intent.kind === "delete"
      ? workspace.days.find(({ items }) => items.some(({ id }) => id === intent.input.id))?.id
      : undefined;
  const resources =
    intent.kind === "clear" || (isStructureIntent(intent) && intent.kind !== "copy")
      ? ["*"]
      : ([
          ...new Set(
            [
              dayId,
              sourceDay,
              intent.kind === "copy" ? intent.input.targetDayId : undefined,
              ...(intent.kind === "copy"
                ? intent.sources
                    .filter((item) => item.variant_id === context.variantId)
                    .map((item) => item.day_id)
                : []),
            ].filter(Boolean),
          ),
        ] as string[]);
  context.queue.enqueue(intent.input.operationId, resources, json(intent), dependencies);
  const projected = context.project();
  context.publish();
  return projected;
}
