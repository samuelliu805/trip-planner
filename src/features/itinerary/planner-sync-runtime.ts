"use client";
import { acceptPlannerIntent } from "./accept-planner-intent";

import { type QueryClient } from "@tanstack/react-query";
import { DurableOutbox, type OutboxOperation } from "../editing/outbox";
import { loadPlannerWorkspace } from "./actions";
import { prepareSyncIntent } from "./prepare-sync-intent";
import { prepareCopySourceParents } from "./prepare-copy-source-parents";
import { sendSyncIntent } from "./send-sync-intent";
import { plannerQueryKey } from "./planner-query";
import { projectSyncIntent, type PlannerSyncIntent } from "./sync-operation";
import type { PlannerSyncDelta, PlannerWorkspace } from "./types";
import { hasScopeReceipt } from "../editing/dependency-receipts";
import { browserResourceLock } from "../editing/browser-resource-lock";
import {
  applyConfirmedDelta,
  mergeConfirmedWorkspace,
  confirmVariantMetadata,
} from "./confirmed-workspace";
import { registerSyncQueue, subscribeSync, tripSyncQueues } from "../editing/sync-registry";
import { projectVariantList, type VariantSyncIntent } from "../variants/sync-intent";
import { validatePlannerIntent } from "./sync-validation";
import { projectApplication, type ApplicationProjection } from "../research/application-projection";
import {
  reboundApplicationProjection,
  resolveApplicationParents,
} from "../research/application-receipt";
import { bindApplicationProjectionParents } from "../research/application-projection-parents";

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

  attach(client: QueryClient, workspace?: PlannerWorkspace) {
    this.client = client;
    if (workspace) this.confirmed = mergeConfirmedWorkspace(this.confirmed, workspace);
    this.publish();
    void this.queue.pump();
  }

  accept(intent: PlannerSyncIntent) {
    return acceptPlannerIntent(
      {
        scope: this.scope,
        storage: this.storage,
        checkpointKey: this.checkpointKey,
        confirmed: this.confirmed,
        tripId: this.tripId,
        variantId: this.variantId,
        queue: this.queue,
        project: () => this.project(),
        publish: () => this.publish(),
      },
      intent,
    );
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
    const applicationBase = tripSyncQueues(this.scope)
      .flatMap(({ queue }) => queue.operations)
      .reduce((workspace, op) => {
        const intent = op.intent as {
          kind: string;
          input: { variantId?: string };
          projection?: ApplicationProjection;
          applicationParents?: string[];
        };
        return intent.projection && intent.input.variantId === this.variantId
          ? projectApplication(
              workspace,
              reboundApplicationProjection(
                this.storage,
                this.scope,
                op.id,
                bindApplicationProjectionParents(
                  intent.projection,
                  intent.applicationParents ?? op.dependsOn,
                  this.scope,
                  this.storage,
                ),
              ),
            )
          : workspace;
      }, this.confirmed);
    const projected = this.queue.operations
      .filter(({ status }) => status !== "acknowledged")
      .reduce(
        (workspace, operation) =>
          projectSyncIntent(
            workspace,
            resolveApplicationParents(operation, this.scope, this.storage)
              .intent as unknown as PlannerSyncIntent,
          ),
        applicationBase,
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
    this.confirmed = confirmVariantMetadata(this.confirmed, variant);
    this.storage.setItem(this.checkpointKey, JSON.stringify(this.confirmed));
    this.publish();
  }

  async confirmWorkspace(workspace: PlannerWorkspace) {
    this.confirmed = mergeConfirmedWorkspace(this.confirmed, workspace);
    await this.persistConfirmed();
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

  publish() {
    if (!this.queue.isEnabled) return;
    this.client.setQueryData(plannerQueryKey(this.tripId, this.variantId), this.project());
  }

  private async prepare(operation: OutboxOperation) {
    this.reloadCheckpoint();
    return json(
      prepareSyncIntent(
        await prepareCopySourceParents(
          resolveApplicationParents(operation, this.scope, this.storage),
          this.scope,
          this.storage,
        ),
        this.confirmed,
      ),
    );
  }

  private async acknowledge(operation: OutboxOperation) {
    if (operation.ack)
      this.confirmed = applyConfirmedDelta(
        this.confirmed,
        operation.ack as unknown as PlannerSyncDelta,
      );
    await this.persistConfirmed();
    // The checkpoint is durable before a dependent intent can lose its predecessor's ACK.
    queueMicrotask(() => {
      try {
        this.queue.compactAcknowledged();
      } catch {
        /* A retained ACK safely replays next time. */
      }
    });
  }

  private async persistConfirmed() {
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
  }
}
