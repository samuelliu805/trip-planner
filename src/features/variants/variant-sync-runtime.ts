"use client";
import type { QueryClient } from "@tanstack/react-query";
import { DurableOutbox, SyncFailure, type OutboxOperation } from "../editing/outbox";
import { browserResourceLock } from "../editing/browser-resource-lock";
import { hasScopeReceipt } from "../editing/dependency-receipts";
import { isAccountActive, registerAccountQueue } from "../editing/account-runtime";
import { registerSyncQueue, subscribeSync, tripSyncQueues } from "../editing/sync-registry";
import { loadPlannerWorkspace } from "../itinerary/actions";
import { findPlannerRuntime, ownedPlannerRuntime } from "../itinerary/planner-runtime-owner";
import { plannerQueryKey } from "../itinerary/planner-query";
import type { PlannerVariant, PlannerWorkspace } from "../itinerary/types";
import {
  createRouteVariant,
  duplicateRouteVariant,
  updateRouteVariant,
  setPrimaryRouteVariant,
  deleteRouteVariant,
} from "./actions";
import { variantListQueryKey } from "./variant-list-reload";
import {
  variantIntentSchema,
  variantFields,
  sourceSnapshot,
  projectVariantList,
  pendingVariantWorkspace,
  type VariantSyncIntent,
} from "./sync-intent";

const json = (value: unknown): OutboxOperation["intent"] => JSON.parse(JSON.stringify(value));
export class VariantSyncRuntime {
  readonly queue: DurableOutbox;
  private confirmed: PlannerVariant[];
  private removed = new Set<string>();
  private checkpoint: string;
  private generation = 0;
  private checkpointBytes?: string;
  constructor(
    readonly scope: string[],
    private client: QueryClient,
    private storage: Storage,
    initial: PlannerVariant[],
  ) {
    this.confirmed = initial;
    this.checkpoint = `trip-planner:variants-baseline:v1:${JSON.stringify(scope)}`;
    this.reload();
    this.queue = new DurableOutbox(
      `trip-planner:variants-outbox:v1:${JSON.stringify(scope)}`,
      storage,
      (op) => this.prepare(op),
      (wire) => this.send(wire as unknown as VariantSyncIntent),
      (op) => this.ack(op),
      () => navigator.onLine,
      browserResourceLock,
      (value) => {
        variantIntentSchema.parse(value);
      },
      (id) =>
        hasScopeReceipt(storage, scope, id) ||
        tripSyncQueues(scope).some(
          ({ queue }) =>
            storage.getItem(`${queue.prefix}-receipt:${id}`) === "1" ||
            queue.operations.some((op) => op.id === id && op.status === "acknowledged"),
        ),
    );
    this.queue.subscribe(() => this.publish());
    registerSyncQueue({ scope, queue: this.queue });
    subscribeSync(() => {
      void this.queue.pump();
    });
    registerAccountQueue(scope[1], (enabled) => {
      if (enabled) {
        this.reload();
        this.queue.reload();
      }
      this.queue.setEnabled(enabled);
      this.publish();
      if (enabled)
        this.queue.operations
          .filter((op) => op.ack !== undefined)
          .forEach((op) => {
            void this.ack(op).catch(() => {});
          });
    });
  }
  reload() {
    const bytes = this.storage.getItem(this.checkpoint) ?? "null";
    if (this.checkpointBytes !== undefined && bytes !== this.checkpointBytes) this.generation++;
    this.checkpointBytes = bytes;
    const stored = JSON.parse(bytes);
    if (stored) {
      if (!Array.isArray(stored.variants) || !Array.isArray(stored.removed))
        throw new Error("The saved Plans could not be recovered.");
      this.removed = new Set(stored.removed);
      this.merge(stored.variants);
    }
  }
  private merge(variants: PlannerVariant[]) {
    const rows = new Map(this.confirmed.map((row) => [row.id, row]));
    for (const row of variants) {
      const before = rows.get(row.id);
      if (!this.removed.has(row.id))
        rows.set(row.id, {
          ...(before && before.version > row.version ? before : row),
          content_version: Math.max(before?.content_version ?? 0, row.content_version),
          days_version: Math.max(before?.days_version ?? 0, row.days_version),
          items_version: Math.max(before?.items_version ?? 0, row.items_version),
        });
    }
    this.confirmed = [...rows.values()].filter((row) => !this.removed.has(row.id));
  }
  private save() {
    const bytes = JSON.stringify({ variants: this.confirmed, removed: [...this.removed] });
    this.storage.setItem(this.checkpoint, bytes);
    this.checkpointBytes = bytes;
  }
  beginRead() {
    return this.generation;
  }
  reconcile(variants: PlannerVariant[], generation = this.generation) {
    this.reload();
    if (generation !== this.generation) return this.project();
    const present = new Set(variants.map((row) => row.id));
    this.confirmed = this.confirmed.filter((row) => present.has(row.id));
    this.merge(variants);
    this.save();
    return this.project();
  }
  project() {
    return projectVariantList(
      this.confirmed,
      this.queue.operations
        .filter((op) => op.status !== "acknowledged")
        .map((op) => op.intent as unknown as VariantSyncIntent),
    );
  }
  accept(intent: VariantSyncIntent) {
    variantIntentSchema.parse(intent);
    const variants = this.project();
    if (
      intent.kind === "create" &&
      (variants.length >= 5 ||
        variants.some(
          (row) => row.name.trim().toLowerCase() === intent.input.name.trim().toLowerCase(),
        ))
    )
      throw new Error("Choose a unique Plan name within the five Plan limit.");
    if (
      intent.kind === "delete" &&
      (variants.length <= 1 ||
        variants.find((row) => row.id === intent.input.variantId)?.is_primary)
    )
      throw new Error("Choose another primary Plan before deleting this Plan.");
    if (!this.storage.getItem(this.checkpoint)) this.save();
    const target = intent.kind === "create" ? intent.input.sourceVariantId : intent.input.variantId;
    const own = this.queue.operations.filter((op) => {
      if (op.status === "acknowledged") return false;
      if (intent.kind !== "update") return true;
      const previous = op.intent as unknown as VariantSyncIntent;
      return (
        previous.kind === "primary" ||
        (previous.kind === "create" ? previous.input.operationId : previous.input.variantId) ===
          target
      );
    });
    if (intent.kind === "update" || intent.kind === "primary") {
      const current = this.project().find((row) => row.id === target);
      if (!current) throw new Error("This Plan is no longer available.");
      if (own.length) intent.before = variantFields(current);
    }
    const parents = tripSyncQueues(this.scope)
      .filter((entry) => entry.scope[3] === target && entry.queue !== this.queue)
      .flatMap(({ queue }) =>
        queue.operations.filter((op) => op.status !== "acknowledged").map((op) => op.id),
      );
    this.queue.enqueue(
      intent.input.operationId,
      intent.kind === "update" ? [target] : ["*"],
      json(intent),
      [...own.map((op) => op.id), ...parents],
    );
    if (intent.kind === "create")
      this.client.setQueryData(
        plannerQueryKey(this.scope[2], intent.input.operationId),
        pendingVariantWorkspace(intent),
      );
    this.publish();
    return {
      variantId: intent.kind === "create" ? intent.input.operationId : intent.input.variantId,
      variants: this.project(),
    };
  }
  private async prepare(op: OutboxOperation) {
    this.reload();
    const intent = structuredClone(op.intent) as unknown as VariantSyncIntent;
    if (intent.kind === "create") {
      const loaded = await loadPlannerWorkspace(this.scope[2], intent.input.sourceVariantId);
      if (!loaded.data || sourceSnapshot(loaded.data) !== sourceSnapshot(intent.source))
        throw new SyncFailure(
          "The source Plan changed. Your copy request is kept for review.",
          "conflict",
        );
      const source = loaded.data.variant;
      Object.assign(intent.input, {
        expectedSourceVersion: source.version,
        expectedSourceContentVersion: source.content_version,
        expectedSourceDaysVersion: source.days_version,
        expectedSourceItemsVersion: source.items_version,
      });
    } else if ((intent.kind === "update" || intent.kind === "primary") && intent.before) {
      const current = this.confirmed.find((row) => row.id === intent.input.variantId);
      if (!current || variantFields(current) !== intent.before)
        throw new SyncFailure("The Plan changed elsewhere. Your edit is kept.", "conflict");
      intent.input.expectedVersion = current.version;
    }
    return json(intent);
  }
  private async send(intent: VariantSyncIntent) {
    const result = await (intent.kind === "create"
      ? (intent.duplicate ? duplicateRouteVariant : createRouteVariant)(intent.input)
      : intent.kind === "update"
        ? updateRouteVariant(intent.input)
        : intent.kind === "primary"
          ? setPrimaryRouteVariant(intent.input)
          : deleteRouteVariant(intent.input));
    if (!result.data)
      throw new SyncFailure(result.error, result.code === "conflict" ? "conflict" : "failed");
    return json(result.data);
  }
  private async ack(op: OutboxOperation) {
    if (!isAccountActive(this.scope[1])) return;
    const intent = op.intent as unknown as VariantSyncIntent;
    const result = op.ack as unknown as { variantId: string; variants: PlannerVariant[] };
    if (!result || !Array.isArray(result.variants))
      throw new Error("The saved Plan response could not be recovered.");
    if (intent.kind === "create") {
      const workspace = await loadPlannerWorkspace(this.scope[2], result.variantId);
      if (!isAccountActive(this.scope[1])) return;
      if (!workspace.data)
        throw new Error(workspace.error ?? "The new Plan could not be recovered.");
      ownedPlannerRuntime(
        [this.scope[0], this.scope[1], this.scope[2], result.variantId],
        this.client,
        workspace.data,
        { confirmedRead: true },
      );
    }
    const write = async () => {
      this.reload();
      if (intent.kind === "delete") this.removed.add(intent.input.variantId);
      this.merge(result.variants);
      for (const variant of this.confirmed)
        findPlannerRuntime([
          this.scope[0],
          this.scope[1],
          this.scope[2],
          variant.id,
        ])?.confirmVariant(variant);
      this.save();
      this.generation++;
      this.publish();
    };
    if (navigator.locks) await navigator.locks.request(this.checkpoint, write);
    else await write();
    queueMicrotask(() => {
      try {
        this.queue.compactAcknowledged();
      } catch {
        /* Keep durable ACK. */
      }
    });
  }
  publish() {
    if (!this.queue?.isEnabled) return;
    for (const op of this.queue.operations) {
      const intent = op.intent as unknown as VariantSyncIntent;
      const key = plannerQueryKey(this.scope[2], op.id);
      if (intent.kind === "create" && !this.client.getQueryData(key))
        this.client.setQueryData(key, pendingVariantWorkspace(intent));
    }
    const variants = this.project();
    this.client.setQueryData(variantListQueryKey(this.scope[2]), variants);
    for (const [key, workspace] of this.client.getQueriesData<PlannerWorkspace>({
      queryKey: ["planner", this.scope[2]],
    })) {
      const variant = variants.find((row) => row.id === workspace?.variant.id);
      if (workspace && variant)
        this.client.setQueryData(key, {
          ...workspace,
          variant: {
            ...variant,
            days_version: Math.max(variant.days_version, workspace.variant.days_version),
            items_version: Math.max(variant.items_version, workspace.variant.items_version),
            content_version: Math.max(variant.content_version, workspace.variant.content_version),
          },
        });
    }
  }
}
