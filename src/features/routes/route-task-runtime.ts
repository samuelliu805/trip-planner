"use client";
import type { QueryClient } from "@tanstack/react-query";
import { DurableOutbox, SyncFailure, type OutboxOperation } from "../editing/outbox";
import { browserResourceLock } from "../editing/browser-resource-lock";
import { registerSyncQueue, subscribeSync, tripSyncQueues } from "../editing/sync-registry";
import { isAccountActive, registerAccountQueue } from "../editing/account-runtime";
import { hasScopeReceipt } from "../editing/dependency-receipts";
import { plannerQueryKey } from "../itinerary/planner-query";
import { loadPlannerWorkspace } from "../itinerary/actions";
import { ownedPlannerRuntime } from "../itinerary/planner-runtime-owner";
import type { PlannerWorkspace } from "../itinerary/types";
import {
  saveDayRoutePlan,
  calculateDayRoute,
  clearDayRoutePlan,
  calculateOverviewRoute,
} from "./actions";
import { optimisticPlan, replacePlan } from "./route-cache";
import { routeTaskSchema, routePlanSnapshot, type RouteTaskIntent } from "./route-task-intent";
import type { DayRoutePlan } from "./types";
import type { OverviewTaskResult } from "./overview-results";

type Checkpoint = {
  plans: Record<string, DayRoutePlan | null>;
  saved: Record<string, DayRoutePlan>;
  overview: OverviewTaskResult[];
};
const json = (value: unknown): OutboxOperation["intent"] => JSON.parse(JSON.stringify(value));
export const overviewTaskKey = (scope: string[]) => ["overview-route-results", ...scope];

/** Explicit route requests survive their editor. Paid requests never retry automatically. */
export class RouteTaskRuntime {
  readonly queue: DurableOutbox;
  private checkpointKey: string;
  private confirmed: Checkpoint = { plans: {}, saved: {}, overview: [] };
  constructor(
    readonly scope: string[],
    private client: QueryClient,
    private storage: Storage,
  ) {
    this.checkpointKey = `trip-planner:route-baseline:v1:${JSON.stringify(scope)}`;
    this.reloadCheckpoint();
    this.queue = new DurableOutbox(
      `trip-planner:route-outbox:v1:${JSON.stringify(scope)}`,
      storage,
      (op) => this.prepare(op),
      (wire) => this.send(wire as unknown as RouteTaskIntent),
      (op) => this.ack(op),
      () => navigator.onLine,
      browserResourceLock,
      (value) => {
        routeTaskSchema.parse(value);
      },
      (id) => this.parentComplete(id),
    );
    this.queue.requireManualReplay(
      "This calculation was interrupted. Review the saved configuration and retry explicitly.",
    );
    this.queue.subscribe(() => this.publish());
    registerSyncQueue({ scope, queue: this.queue });
    subscribeSync(() => {
      void this.queue.pump();
    });
    registerAccountQueue(scope[1], (enabled) => {
      if (enabled) {
        this.reloadCheckpoint();
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
  private parentComplete(id: string) {
    if (hasScopeReceipt(this.storage, this.scope, id)) return true;
    return tripSyncQueues(this.scope)
      .filter((entry) => entry.queue !== this.queue)
      .some(
        ({ queue }) =>
          queue.operations.some((op) => op.id === id && op.status === "acknowledged") ||
          this.storage.getItem(`${queue.prefix}-receipt:${id}`) === "1",
      );
  }
  private reloadCheckpoint() {
    const stored = JSON.parse(
      this.storage.getItem(this.checkpointKey) ?? "null",
    ) as Checkpoint | null;
    if (stored) {
      if (!stored.plans || !stored.saved || !Array.isArray(stored.overview))
        throw new Error("The saved route results could not be recovered.");
      this.confirmed = stored;
    }
  }
  private saveCheckpoint() {
    this.storage.setItem(this.checkpointKey, JSON.stringify(this.confirmed));
  }
  private async checkpoint(update: (checkpoint: Checkpoint) => void) {
    const write = async () => {
      this.reloadCheckpoint();
      update(this.confirmed);
      this.saveCheckpoint();
    };
    if (navigator.locks) await navigator.locks.request(this.checkpointKey, write);
    else await write();
  }
  accept(intent: RouteTaskIntent) {
    routeTaskSchema.parse(intent);
    const dayId = "dayId" in intent.input ? intent.input.dayId : undefined;
    const prior = this.queue.operations.filter(
      (op) =>
        op.status !== "acknowledged" &&
        (dayId
          ? "dayId" in (op.intent as unknown as RouteTaskIntent).input &&
            (op.intent as { input: { dayId: string } }).input.dayId === dayId
          : (op.intent as { kind: string }).kind === "overview"),
    );
    const workspace = this.client.getQueryData<PlannerWorkspace>(
      plannerQueryKey(this.scope[2], this.scope[3]),
    );
    const plan = workspace?.routePlans.find((plan) => plan.day_id === dayId);
    if (prior.length && intent.kind !== "overview" && plan) intent.before = routePlanSnapshot(plan);
    if (dayId && !(dayId in this.confirmed.plans)) {
      this.reloadCheckpoint();
      this.confirmed.plans[dayId] = plan ?? null;
      this.saveCheckpoint();
    }
    const relevantDays =
      intent.kind === "day"
        ? new Set(
            workspace?.days
              .filter((day) => day.items.some((item) => intent.input.itemIds.includes(item.id)))
              .map((day) => day.id),
          )
        : new Set(dayId ? [dayId] : []);
    const parents = tripSyncQueues(this.scope)
      .filter(
        (entry) =>
          entry.queue.prefix.startsWith("trip-planner:outbox:") && entry.scope[3] === this.scope[3],
      )
      .flatMap(({ queue }) =>
        queue.operations
          .filter(
            (op) =>
              op.status !== "acknowledged" &&
              (!dayId ||
                op.resources.some((resource) => resource === "*" || relevantDays.has(resource))),
          )
          .map((op) => op.id),
      );
    this.queue.enqueue(intent.input.operationId, [dayId ?? "overview"], json(intent), [
      ...prior.map((op) => op.id),
      ...parents,
    ]);
    this.publish();
  }
  private prepare(op: OutboxOperation) {
    this.reloadCheckpoint();
    const intent = structuredClone(op.intent) as unknown as RouteTaskIntent;
    if (intent.kind !== "overview" && intent.before) {
      const plan = this.confirmed.plans[intent.input.dayId];
      if (!plan || routePlanSnapshot(plan) !== intent.before)
        throw new SyncFailure(
          "The saved route changed elsewhere. Your configuration is kept.",
          "conflict",
        );
      intent.input.expectedVersion = plan.version;
    }
    return json(intent);
  }
  private async send(intent: RouteTaskIntent) {
    if (intent.kind === "overview") {
      const result = await calculateOverviewRoute(intent.input);
      if (!result.data)
        throw new SyncFailure(result.error, result.code === "conflict" ? "conflict" : "failed");
      return json({
        kind: "overview",
        result: {
          operationId: intent.input.operationId,
          stageKey: intent.stageKey,
          generation: intent.generation,
          modes: intent.modes,
          legs: result.data,
        },
      });
    }
    if (intent.kind === "clear") {
      const result = await clearDayRoutePlan(intent.input);
      if (!result.data)
        throw new SyncFailure(result.error, result.code === "conflict" ? "conflict" : "failed");
      return json({ kind: "clear", dayId: intent.input.dayId });
    }
    this.reloadCheckpoint();
    let plan = this.confirmed.saved[intent.input.operationId];
    if (!plan) {
      const result = await saveDayRoutePlan(intent.input);
      if (!result.data)
        throw new SyncFailure(result.error, result.code === "conflict" ? "conflict" : "failed");
      plan = result.data;
      if (routePlanSnapshot(plan) !== JSON.stringify([intent.input.itemIds, intent.input.legModes]))
        throw new SyncFailure(
          "The route changed after saving. Review it before calculating.",
          "conflict",
        );
      const saved = plan;
      await this.checkpoint((checkpoint) => {
        checkpoint.saved[intent.input.operationId] = saved;
      });
    }
    const calculated = await calculateDayRoute({
      tripId: this.scope[2],
      variantId: this.scope[3],
      planId: plan.id,
      expectedPlanVersion: plan.version,
      expectedVersion: plan.calculation?.version ?? 0,
      operationId: intent.calculateOperationId,
      expectedInputSnapshot: intent.expectedInputSnapshot,
      telemetryRouteMode: intent.input.telemetryRouteMode,
    });
    if (!calculated.data)
      throw new SyncFailure(
        calculated.error,
        calculated.code === "conflict" ? "conflict" : "failed",
      );
    return json({ kind: "day", plan: calculated.data });
  }
  private async ack(op: OutboxOperation) {
    if (!isAccountActive(this.scope[1])) return;
    const ack = op.ack as unknown as {
      kind: string;
      dayId?: string;
      plan?: DayRoutePlan;
      result?: OverviewTaskResult;
    };
    if (!ack) return;
    if (ack.kind !== "overview") {
      const loaded = await loadPlannerWorkspace(this.scope[2], this.scope[3]);
      if (!isAccountActive(this.scope[1])) return;
      if (!loaded.data) throw new Error(loaded.error ?? "The saved route could not be recovered.");
      ownedPlannerRuntime(this.scope, this.client, loaded.data).reconcile(loaded.data);
    }
    await this.checkpoint((checkpoint) => {
      if (ack.kind === "overview" && ack.result)
        checkpoint.overview = [
          ack.result,
          ...checkpoint.overview.filter((row) => row.operationId !== ack.result!.operationId),
        ].slice(0, 50);
      if (ack.kind === "day" && ack.plan) checkpoint.plans[ack.plan.day_id] = ack.plan;
      if (ack.kind === "clear" && ack.dayId) checkpoint.plans[ack.dayId] = null;
      delete checkpoint.saved[op.id];
    });
    this.publish();
    queueMicrotask(() => {
      try {
        this.queue.compactAcknowledged();
      } catch {
        /* ACK stays durable. */
      }
    });
  }
  publish() {
    if (!this.queue.isEnabled) return;
    this.client.setQueryData(overviewTaskKey(this.scope), this.confirmed.overview);
    this.client.setQueryData<PlannerWorkspace>(
      plannerQueryKey(this.scope[2], this.scope[3]),
      (workspace) => {
        if (!workspace) return workspace;
        let projected = workspace;
        const pending = this.queue.operations.filter((op) => op.status !== "acknowledged");
        const days = new Set(
          pending.flatMap((op) =>
            "dayId" in (op.intent as unknown as RouteTaskIntent).input
              ? [(op.intent as { input: { dayId: string } }).input.dayId]
              : [],
          ),
        );
        for (const dayId of days) {
          const plan = this.confirmed.plans[dayId];
          projected = {
            ...projected,
            routePlans: [
              ...projected.routePlans.filter((row) => row.day_id !== dayId),
              ...(plan ? [plan] : []),
            ],
          };
        }
        for (const op of pending) {
          const intent = op.intent as unknown as RouteTaskIntent;
          if (intent.kind === "day")
            projected = replacePlan(projected, optimisticPlan(projected, intent.input))!;
          if (intent.kind === "clear")
            projected = {
              ...projected,
              routePlans: projected.routePlans.filter((plan) => plan.day_id !== intent.input.dayId),
            };
        }
        return projected;
      },
    );
  }
}
