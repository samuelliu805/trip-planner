"use client";
import { useEffect, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { DurableOutbox, SyncFailure, type OutboxOperation } from "../editing/outbox";
import { browserResourceLock } from "../editing/browser-resource-lock";
import { registerAccountQueue } from "../editing/account-runtime";
import { registerSyncQueue } from "../editing/sync-registry";
import { tripSyncQueues, subscribeSync } from "../editing/sync-registry";
import { hasScopeReceipt } from "../editing/dependency-receipts";
import { useDraftScope } from "../editing/draft-scope";
import { stableJson } from "../editing/stable-json";
import type { Trip } from "@/platform/contracts/trips";
import type { PlannerWorkspace } from "../itinerary/types";
import { optimisticTripDayDates } from "./date-fields";
import { saveTripSettings } from "./settings-actions";
import { loadLatestTripSettings } from "./settings-read";
import { updateTripSchema } from "./schema";
import type { z } from "zod";
import { setLocalActivity } from "../editing/sync-registry";

type Input = z.infer<typeof updateTripSchema>;
type Intent = { input: Input; before?: string; followsLocal?: boolean };
const json = (value: unknown): OutboxOperation["intent"] => JSON.parse(JSON.stringify(value));
const fields = (trip: Trip) =>
  stableJson([
    trip.title,
    trip.start_date,
    trip.end_date,
    trip.day_count,
    trip.currency,
    trip.timezone,
  ]);
function project(trip: Trip, input: Input): Trip {
  return {
    ...trip,
    title: input.title,
    currency: input.currency,
    timezone: input.timezone,
    day_count: input.dayCount,
    start_date: input.startDate || null,
    end_date: input.endDate || null,
    version: trip.version + 1,
  };
}

class SettingsSync {
  readonly queue: DurableOutbox;
  private confirmed: Trip;
  private checkpoint: string;
  constructor(
    readonly scope: string[],
    private client: QueryClient,
    trip: Trip,
    private storage: Storage,
  ) {
    this.confirmed = trip;
    this.checkpoint = `trip-planner:settings-baseline:v1:${JSON.stringify(scope)}`;
    this.reloadCheckpoint();
    this.queue = new DurableOutbox(
      `trip-planner:settings-outbox:v1:${JSON.stringify(scope)}`,
      storage,
      (op) => this.prepare(op),
      async (wire) => {
        const result = await saveTripSettings((wire as unknown as Intent).input);
        if (!result.data)
          throw new SyncFailure(result.error, result.conflict ? "conflict" : "failed");
        return json(result.data);
      },
      (op) => this.ack(op),
      () => navigator.onLine,
      browserResourceLock,
      (value) => {
        if (!value || typeof value !== "object" || Array.isArray(value) || !("input" in value))
          throw new Error("The settings queue is damaged. Your draft is kept.");
        updateTripSchema.parse(value.input);
      },
      (id) => hasScopeReceipt(storage, scope, id),
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
    });
    this.queue.operations
      .filter((op) => op.ack)
      .forEach((op) => {
        void this.ack(op).catch(() => {});
      });
  }
  reconcile(trip: Trip) {
    if (trip.version >= this.confirmed.version) this.confirmed = trip;
    this.publish();
  }
  project() {
    return this.queue.operations.reduce(
      (trip, op) =>
        op.ack
          ? this.merge(trip, op.ack as unknown as Trip)
          : project(trip, (op.intent as unknown as Intent).input),
      this.confirmed,
    );
  }
  accept(input: Input) {
    if (!this.storage.getItem(this.checkpoint))
      this.storage.setItem(this.checkpoint, JSON.stringify(this.confirmed));
    const parsed = updateTripSchema.parse(input);
    const previous = this.project();
    const dependencies = this.queue.operations
      .filter((op) => op.status !== "acknowledged")
      .map((op) => op.id);
    const followsLocal = dependencies.length > 0;
    if (
      parsed.dayCount !== previous.day_count ||
      (parsed.startDate || null) !== previous.start_date ||
      (parsed.endDate || null) !== previous.end_date
    )
      for (const entry of tripSyncQueues(this.scope)) {
        if (entry.queue === this.queue) continue;
        for (const op of entry.queue.operations)
          if (
            op.status !== "acknowledged" &&
            (entry.queue.prefix.startsWith("trip-planner:outbox:") ||
              entry.queue.prefix.startsWith("trip-planner:variants-outbox:") ||
              ["idea.apply", "booking.apply", "booking.revert"].includes(
                String((op.intent as { kind?: unknown } | null)?.kind),
              ))
          )
            dependencies.push(op.id);
      }
    this.queue.enqueue(
      parsed.operationId,
      ["*"],
      json({ input: parsed, before: fields(previous), followsLocal }),
      dependencies,
    );
    return this.project();
  }
  private merge(a: Trip, b: Trip) {
    return {
      ...(b.version >= a.version ? b : a),
      content_version: Math.max(a.content_version, b.content_version),
    };
  }
  private reloadCheckpoint() {
    const cached = JSON.parse(this.storage.getItem(this.checkpoint) ?? "null") as Trip | null;
    if (cached?.id === this.confirmed.id) this.confirmed = this.merge(this.confirmed, cached);
  }
  private async prepare(op: OutboxOperation) {
    this.reloadCheckpoint();
    const intent = structuredClone(op.intent) as unknown as Intent;
    if (intent.before) {
      const latest = await loadLatestTripSettings(this.confirmed.id);
      if (fields(latest) !== intent.before)
        throw new SyncFailure("Trip settings changed elsewhere. Your draft is kept.", "conflict");
      if (
        !intent.followsLocal &&
        intent.input.dayCount < latest.day_count &&
        latest.content_version !==
          (intent.followsLocal
            ? this.confirmed.content_version
            : intent.input.expectedContentVersion)
      )
        throw new SyncFailure(
          "Trip content changed before shortening it. Review the latest Plan. Your draft is kept.",
          "conflict",
        );
      this.confirmed = this.merge(this.confirmed, latest);
      intent.input.expectedVersion = this.confirmed.version;
      intent.input.expectedContentVersion = this.confirmed.content_version;
    }
    return json(intent);
  }
  private publish() {
    if (!this.queue.isEnabled) return;
    const trip = this.project();
    this.client.setQueryData(["trip-settings", trip.id], trip);
    this.client.setQueriesData<PlannerWorkspace>({ queryKey: ["planner", trip.id] }, (current) =>
      current
        ? { ...current, days: optimisticTripDayDates(current.days, trip.start_date ?? "") }
        : current,
    );
    window.dispatchEvent(new CustomEvent("trip-planner:trip-settings", { detail: trip }));
  }
  private async ack(op: OutboxOperation) {
    if (!op.ack) return;
    const commit = async () => {
      this.reloadCheckpoint();
      this.confirmed = this.merge(this.confirmed, op.ack as unknown as Trip);
      this.storage.setItem(this.checkpoint, JSON.stringify(this.confirmed));
      this.publish();
    };
    if (navigator.locks) await navigator.locks.request(this.checkpoint, commit);
    else await commit();
    if (this.queue.isEnabled)
      void this.client.invalidateQueries({ queryKey: ["planner", this.confirmed.id] });
    queueMicrotask(() => {
      try {
        this.queue.compactAcknowledged();
      } catch {
        /* ACK remains durable. */
      }
    });
  }
}
const owners = new Map<string, SettingsSync>();
export function ownedSettingsRuntime(scope: string[], client: QueryClient, trip: Trip) {
  const key = JSON.stringify(scope);
  const runtime = owners.get(key) ?? new SettingsSync(scope, client, trip, localStorage);
  owners.set(key, runtime);
  runtime.reconcile(trip);
  return runtime;
}
export function useSettingsSync(trip: Trip) {
  const scope = useDraftScope(trip.id, "settings"),
    key = JSON.stringify(scope),
    client = useQueryClient();
  const [owned, setOwned] = useState<{ key: string; runtime: SettingsSync }>();
  useEffect(() => {
    if (scope[1] === "guest") return;
    try {
      const runtime = ownedSettingsRuntime(scope, client, trip);
      runtime.queue.setEnabled(true);
      let current = true;
      queueMicrotask(() => {
        if (current) setOwned({ key, runtime });
      });
      return () => {
        current = false;
      };
    } catch (error) {
      setLocalActivity(`settings-runtime:${key}`, {
        scope,
        state: "local-failure",
        error: String(error),
      });
    }
    // Scope owns queue lifetime; later reads reconcile through the settings editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client]);
  return owned?.key === key ? owned.runtime : undefined;
}
