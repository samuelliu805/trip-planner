"use client";

import { type QueryClient } from "@tanstack/react-query";
import { DurableOutbox, type OutboxOperation } from "../editing/outbox";
import { loadPlannerWorkspace } from "./actions";
import { prepareSyncIntent } from "./prepare-sync-intent";
import { sendSyncIntent } from "./send-sync-intent";
import { dayIds, dayEditSnapshot, isStructureIntent } from "./structure-sync";
import { plannerQueryKey } from "./planner-query";
import { intentItemIds, projectSyncIntent, type PlannerSyncIntent } from "./sync-operation";
import type { PlannerSyncDelta, PlannerWorkspace } from "./types";
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
import { hasScopeReceipt } from "../editing/dependency-receipts";
import { browserResourceLock } from "../editing/browser-resource-lock";
import { applyConfirmedDelta, mergeConfirmedWorkspace } from "./confirmed-workspace";
import { itemEditableSnapshot } from "./item-editable-snapshot";
import { registerSyncQueue, subscribeSync, tripSyncQueues } from "../editing/sync-registry";
import { projectVariantList, type VariantSyncIntent } from "../variants/sync-intent";
import { validatePlannerIntent } from "./sync-validation";

const json = (value: unknown): OutboxOperation["intent"] => JSON.parse(JSON.stringify(value));

/** Owned by the account runtime, so closing an editor or changing views does not cancel writes. */
export class PlannerSyncRuntime {
  readonly queue: DurableOutbox;
  readonly scope: string[];
  private confirmed: PlannerWorkspace;
  private client: QueryClient;
  private tripId: string;
  private variantId: string;
  private storage: Storage;
  private checkpointKey: string;

  constructor(scope: string[], client: QueryClient, workspace: PlannerWorkspace, storage: Storage) {
    this.scope = scope;
    this.client = client;
    this.confirmed = workspace;
    this.storage = storage;
    this.checkpointKey = `trip-planner:sync-baseline:v1:${JSON.stringify(scope)}`;
    try {
      const cached = JSON.parse(
        storage.getItem(this.checkpointKey) ?? "null",
      ) as PlannerWorkspace | null;
      if (cached?.variant.id === workspace.variant.id && Array.isArray(cached.days))
        this.confirmed = mergeConfirmedWorkspace(this.confirmed, cached);
    } catch {
      /* Current validated server data remains the baseline; queued intents are retained. */
    }
    this.tripId = workspace.variant.trip_id;
    this.variantId = workspace.variant.id;
    const prefix = `trip-planner:outbox:v1:${JSON.stringify(scope)}`;
    this.queue = new DurableOutbox(
      prefix,
      storage,
      (operation) => this.prepare(operation),
      async (wire) => json(await sendSyncIntent(wire as unknown as PlannerSyncIntent)),
      (operation) => this.acknowledge(operation),
      () => navigator.onLine,
      browserResourceLock,
      validatePlannerIntent,
      (id) => hasScopeReceipt(storage, scope, id),
    );
    // Retained ACKs restore confirmed deltas before replaying unsent intents.
    this.queue.operations
      .filter(({ status }) => status === "acknowledged")
      .forEach((operation) => {
        void this.acknowledge(operation).catch(() => {
          /* The durable ACK remains recoverable. */
        });
      });
    this.queue.subscribe(() => this.publish());
    registerSyncQueue({ scope, queue: this.queue, reapply: (id) => this.reapplyItem(id) });
    subscribeSync(() => {
      void this.queue.pump();
    });
  }

  attach(client: QueryClient, workspace: PlannerWorkspace) {
    this.client = client;
    this.confirmed = mergeConfirmedWorkspace(this.confirmed, workspace);
    this.publish();
    void this.queue.pump();
  }

  accept(intent: PlannerSyncIntent) {
    if (!this.storage.getItem(this.checkpointKey))
      this.storage.setItem(this.checkpointKey, JSON.stringify(this.confirmed));
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
    const workspace = this.project();
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
    const dependencies = this.queue.operations
      .filter(
        (operation) =>
          operation.status !== "acknowledged" &&
          intentItemIds(operation.intent as unknown as PlannerSyncIntent).some((id) =>
            ids.includes(id),
          ),
      )
      .map(({ id }) => id);
    const planParent = `trip-planner:variants-outbox:v1:${JSON.stringify([this.scope[0], this.scope[1], this.scope[2], "variants"])}:${this.variantId}`;
    if (this.storage.getItem(planParent)) dependencies.push(this.variantId);
    for (const entry of tripSyncQueues(this.scope)) {
      if (entry.queue === this.queue) continue;
      for (const op of entry.queue.operations.filter((op) => op.status !== "acknowledged")) {
        const action = op.intent as {
          kind: string;
          input: { variantId?: string };
          variantId?: string;
        };
        if (
          ["idea.apply", "booking.apply", "booking.revert"].includes(action.kind) &&
          (action.input.variantId ?? action.variantId) === this.variantId
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
    for (const operation of this.queue.operations.filter((op) => op.status !== "acknowledged")) {
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
                      .filter((item) => item.variant_id === this.variantId)
                      .map((item) => item.day_id)
                  : []),
              ].filter(Boolean),
            ),
          ] as string[]);
    this.queue.enqueue(intent.input.operationId, resources, json(intent), dependencies);
    const projected = this.project();
    this.publish();
    return projected;
  }

  project() {
    this.queue.operations
      .filter(({ status }) => status === "acknowledged")
      .forEach((operation) => {
        if (operation.ack)
          this.confirmed = applyConfirmedDelta(
            this.confirmed,
            operation.ack as unknown as PlannerSyncDelta,
          );
      });
    const projected = this.queue.operations
      .filter(({ status }) => status !== "acknowledged")
      .reduce(
        (workspace, operation) =>
          projectSyncIntent(workspace, operation.intent as unknown as PlannerSyncIntent),
        this.confirmed,
      );
    const variantIntents = tripSyncQueues(this.scope)
      .filter((entry) => entry.queue.prefix.startsWith("trip-planner:variants-outbox:"))
      .flatMap(({ queue }) =>
        queue.operations
          .filter((op) => op.status !== "acknowledged")
          .map((op) => op.intent as unknown as VariantSyncIntent),
      );
    const variant =
      projectVariantList([projected.variant], variantIntents).find(
        (row) => row.id === this.variantId,
      ) ?? projected.variant;
    return { ...projected, variant };
  }

  reconcile(workspace: PlannerWorkspace) {
    this.confirmed = mergeConfirmedWorkspace(this.confirmed, workspace);
    return this.project();
  }

  confirmAttachments(
    entityId: string,
    attachments: import("../attachments/schema").OwnerAttachment[],
    attachmentsVersion?: number,
  ) {
    this.confirmed = {
      ...this.confirmed,
      days: this.confirmed.days.map((day) => ({
        ...day,
        items: day.items.map((item) =>
          item.id === entityId && (attachmentsVersion ?? 0) >= (item.attachments_version ?? 0)
            ? { ...item, attachments, attachments_version: attachmentsVersion }
            : item,
        ),
      })),
    };
    this.storage.setItem(this.checkpointKey, JSON.stringify(this.confirmed));
    this.publish();
  }
  confirmVariant(variant: PlannerWorkspace["variant"]) {
    this.confirmed = mergeConfirmedWorkspace(this.confirmed, { ...this.confirmed, variant });
    this.storage.setItem(this.checkpointKey, JSON.stringify(this.confirmed));
    this.publish();
  }

  reloadCheckpoint() {
    const cached = JSON.parse(
      this.storage.getItem(this.checkpointKey) ?? "null",
    ) as PlannerWorkspace | null;
    if (cached?.variant.id === this.variantId && Array.isArray(cached.days))
      this.confirmed = mergeConfirmedWorkspace(this.confirmed, cached);
    this.publish();
  }

  async reapplyItem(id: string) {
    const operation = this.queue.operations.find((entry) => entry.id === id);
    if (!operation || operation.status !== "conflict")
      throw new Error("Reload this conflict before resolving it.");
    const original = operation.intent as unknown as PlannerSyncIntent;
    if (original.kind !== "update") throw new Error("Review this change in its original editor.");
    const loaded = await loadPlannerWorkspace(this.tripId, this.variantId);
    if (!loaded.data) throw new Error(loaded.error ?? "The latest item could not be loaded.");
    this.queue.reload();
    const branch = this.queue.dependentBranch(id);
    if (branch.some(({ intent }) => (intent as unknown as PlannerSyncIntent).kind !== "update"))
      throw new Error(
        "This edit has dependent structural changes. Download the draft and review those changes first.",
      );
    const last = branch.at(-1)?.intent as unknown as PlannerSyncIntent;
    if (last.kind !== "update") return;
    const day = loaded.data.days.find(({ items }) =>
      items.some((item) => item.id === last.input.id),
    );
    const item = day?.items.find((item) => item.id === last.input.id);
    if (!item || !day)
      throw new Error("This item was removed. Download your local edit to recover it.");
    const input = {
      ...last.input,
      dayId: day.id,
      expectedVersion: item.version,
      expectedItemsVersion: day.items_version,
      operationId: crypto.randomUUID(),
    };
    this.confirmed = mergeConfirmedWorkspace(this.confirmed, loaded.data);
    this.queue.enqueue(input.operationId, [day.id], json({ kind: "update", input }));
    this.queue.archiveBranch(id);
    this.publish();
  }

  private publish() {
    if (!this.queue.isEnabled) return;
    this.client.setQueryData(plannerQueryKey(this.tripId, this.variantId), this.project());
  }

  private prepare(operation: OutboxOperation) {
    this.reloadCheckpoint();
    return json(prepareSyncIntent(operation, this.confirmed));
  }

  private async acknowledge(operation: OutboxOperation) {
    if (operation.ack)
      this.confirmed = applyConfirmedDelta(
        this.confirmed,
        operation.ack as unknown as PlannerSyncDelta,
      );
    const checkpoint = async () => {
      const cached = JSON.parse(
        this.storage.getItem(this.checkpointKey) ?? "null",
      ) as PlannerWorkspace | null;
      if (cached?.variant.id === this.variantId && Array.isArray(cached.days))
        this.confirmed = mergeConfirmedWorkspace(this.confirmed, cached);
      this.storage.setItem(this.checkpointKey, JSON.stringify(this.confirmed));
    };
    if (navigator.locks) await navigator.locks.request(this.checkpointKey, checkpoint);
    else await checkpoint();
    // The checkpoint is durable before a dependent intent can lose its predecessor's ACK.
    queueMicrotask(() => {
      try {
        this.queue.compactAcknowledged();
      } catch {
        /* A retained ACK safely replays next time. */
      }
    });
  }
}
