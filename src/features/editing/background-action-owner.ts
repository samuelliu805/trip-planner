"use client";
import { ownerAttachmentSchema } from "../attachments/schema";
import type { QueryClient } from "@tanstack/react-query";
import { loadPlannerWorkspace } from "../itinerary/actions";
import { findPlannerRuntime, ownedPlannerRuntime } from "../itinerary/planner-runtime-owner";
import { plannerQueryKey } from "../itinerary/planner-query";
import { projectApplication } from "../research/application-projection";
import { saveApplicationReceipt } from "../research/application-receipt";
import { resolveApplicationSnapshotParents } from "../research/application-snapshot-receipt";
import { tripSyncQueues } from "./sync-registry";
import { z } from "zod";
import { DurableOutbox, type OutboxOperation } from "./outbox";
import {
  backgroundActionSchema,
  actionId,
  actionResources,
  type BackgroundActionIntent,
} from "./background-action-intent";
import { sendBackgroundAction } from "./send-background-action";
import { browserResourceLock } from "./browser-resource-lock";
import { hasScopeReceipt } from "./dependency-receipts";
import { isAccountActive, registerAccountQueue } from "./account-runtime";
import { registerSyncQueue, subscribeSync } from "./sync-registry";
import { publicItineraryLinkSchema } from "../sharing/schema";
import { prepareBackgroundAction } from "./prepare-background-action";

const completedSchema = z.object({
  id: z.string(),
  intent: backgroundActionSchema,
  result: z.json(),
  at: z.number(),
});
export type CompletedAction = z.infer<typeof completedSchema>;
/** Permission/publication success is recorded only after its server ACK. */
export class BackgroundActionOwner {
  readonly queue: DurableOutbox;
  completed: CompletedAction[] = [];
  private listeners = new Set<() => void>();
  private revision = 0;
  private checkpoint: string;
  constructor(
    readonly scope: string[],
    private storage: Storage,
    private client?: QueryClient,
  ) {
    this.checkpoint = `trip-planner:actions-baseline:v1:${JSON.stringify(scope)}`;
    this.reloadCompleted();
    this.queue = new DurableOutbox(
      `trip-planner:actions-outbox:v1:${JSON.stringify(scope)}`,
      storage,
      (op) => this.prepare(op),
      (wire) => sendBackgroundAction(backgroundActionSchema.parse(wire), scope),
      (op) => this.ack(op),
      () => navigator.onLine,
      browserResourceLock,
      (value) => {
        backgroundActionSchema.parse(value);
      },
      (id) => hasScopeReceipt(storage, scope, id),
    );
    this.queue.setEnabled(false);
    if (scope[3].startsWith("images:"))
      this.queue.requireManualReplay(
        "The export was interrupted. Retry explicitly to resume its saved snapshot.",
      );
    this.queue.subscribe(this.emit);
    registerSyncQueue({ scope, queue: this.queue });
    subscribeSync(() => {
      void this.queue.pump();
    });
    registerAccountQueue(scope[1], (enabled) => {
      if (enabled) this.reload();
      this.queue.setEnabled(enabled);
      if (enabled)
        this.queue.operations
          .filter((op) => op.ack !== undefined)
          .forEach((op) => {
            void this.ack(op).catch(() => {});
          });
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getRevision = () => this.revision;
  private emit = () => {
    for (const op of this.queue?.operations ?? []) {
      const intent = backgroundActionSchema.parse(op.intent);
      if (
        (intent.kind === "idea.apply" || intent.kind === "booking.apply") &&
        intent.projection &&
        this.client
      ) {
        const scope = [...this.scope.slice(0, 3), intent.input.variantId];
        const runtime = findPlannerRuntime(scope);
        if (runtime) runtime.publish();
        else if (op.status !== "acknowledged") {
          const key = plannerQueryKey(this.scope[2], intent.input.variantId);
          this.client.setQueryData(
            key,
            (workspace: import("../itinerary/types").PlannerWorkspace | undefined) =>
              workspace ? projectApplication(workspace, intent.projection!) : workspace,
          );
        }
      }
    }
    this.revision++;
    this.listeners.forEach((listener) => listener());
  };
  private reloadCompleted() {
    this.completed = z
      .array(completedSchema)
      .parse(JSON.parse(this.storage.getItem(this.checkpoint) ?? "[]"));
  }
  reload() {
    this.reloadCompleted();
    this.queue.reload();
    this.emit();
    void this.queue.pump();
  }
  accept(raw: BackgroundActionIntent, dependencies: string[] = []) {
    const intent = backgroundActionSchema.parse(raw);
    const resources = actionResources(intent);
    const parents = this.queue.operations.filter(
      (op) => op.status !== "acknowledged" && op.resources.some((key) => resources.includes(key)),
    );
    if (intent.kind.startsWith("share.")) {
      const previous =
        parents.at(-1) ??
        this.completed
          .filter((op) => actionResources(op.intent).some((key) => resources.includes(key)))
          .at(-1);
      const confirmed =
        previous && "result" in previous
          ? publicItineraryLinkSchema.safeParse((previous.result as { data?: unknown })?.data)
          : undefined;
      const version =
        intent.kind === "share.save"
          ? intent.expectedVersion
          : intent.kind === "share.revoke"
            ? intent.input.expectedVersion
            : undefined;
      if (
        previous &&
        backgroundActionSchema.parse(previous.intent).kind === "share.save" &&
        (!confirmed || (confirmed.success && confirmed.data.version >= (version ?? 0)))
      )
        (intent as Extract<BackgroundActionIntent, { pageKey: string }>).predecessor = previous.id;
    }
    if (
      intent.kind === "idea.apply" ||
      intent.kind === "booking.apply" ||
      intent.kind === "booking.revert"
    ) {
      const target =
        "variantId" in intent.input
          ? intent.input.variantId
          : (intent as { variantId: string }).variantId;
      for (const entry of tripSyncQueues(this.scope)) {
        if (entry.queue === this.queue) continue;
        for (const op of entry.queue.operations.filter((op) => op.status !== "acknowledged")) {
          const parent = op.intent as {
            kind: string;
            input: { variantId?: string; operationId?: string; researchItemId?: string };
          };
          if (
            entry.scope[3] === target ||
            (entry.scope[3] === "variants" &&
              (parent.input.variantId === target ||
                (parent.kind === "create" && parent.input.operationId === target))) ||
            (entry.scope[3] === "ideas" &&
              intent.kind !== "booking.revert" &&
              (intent.kind === "idea.apply"
                ? Object.hasOwn(
                    intent.input.expectedResearchVersions,
                    parent.input.researchItemId ?? parent.input.operationId ?? "",
                  )
                : intent.input.researchItemId === parent.input.researchItemId))
          )
            dependencies.push(op.id);
        }
      }
    }
    if (intent.kind === "idea.apply" || intent.kind === "booking.apply")
      intent.applicationParents = [...parents.map((op) => op.id), ...dependencies];
    this.queue.enqueue(actionId(intent), resources, JSON.parse(JSON.stringify(intent)), [
      ...parents.map((op) => op.id),
      ...dependencies,
    ]);
    return actionId(intent);
  }
  private async prepare(op: OutboxOperation) {
    this.reloadCompleted();
    return prepareBackgroundAction(
      resolveApplicationSnapshotParents(op, this.scope, this.storage),
      this.completed,
    );
  }

  private async ack(op: OutboxOperation) {
    if (!isAccountActive(this.scope[1])) return;
    const intent = backgroundActionSchema.parse(op.intent);
    if (
      this.client &&
      (intent.kind === "idea.apply" ||
        intent.kind === "booking.apply" ||
        intent.kind === "booking.revert")
    ) {
      const variantId =
        intent.kind === "booking.revert" ? intent.variantId : intent.input.variantId;
      if (intent.kind !== "booking.revert" && intent.projection)
        saveApplicationReceipt(
          this.storage,
          this.scope,
          op.id,
          intent.projection,
          (
            op.ack as unknown as {
              data: { projectionRows: import("../itinerary/types").PlannerDay[] };
            }
          ).data.projectionRows,
        );
      const loaded = await loadPlannerWorkspace(this.scope[2], variantId);
      if (!isAccountActive(this.scope[1])) return;
      if (!loaded.data) throw new Error(loaded.error ?? "The updated Plan could not be recovered.");
      ownedPlannerRuntime(
        [this.scope[0], this.scope[1], this.scope[2], variantId],
        this.client,
        loaded.data,
      );
      void this.client.invalidateQueries({ queryKey: ["research-workspace", this.scope[2]] });
      void this.client.invalidateQueries({ queryKey: ["variant-comparison", this.scope[2]] });
      void this.client.invalidateQueries({ queryKey: ["variant-decision-summary", this.scope[2]] });
    }
    if (intent.kind === "attachment.mutate") {
      const result = z
        .object({
          data: z.object({
            attachments: z.array(ownerAttachmentSchema),
            attachmentsVersion: z.number().int().positive(),
            version: z.number().int().positive(),
          }),
        })
        .parse(op.ack);
      window.dispatchEvent(
        new CustomEvent("trip-planner:attachments-updated", {
          detail: {
            scope: this.scope,
            target: intent.input.target,
            tripId: this.scope[2],
            entityId: intent.input.entityId,
            attachments: result.data.attachments,
            attachmentsVersion: result.data.attachmentsVersion,
          },
        }),
      );
    }
    const write = async () => {
      this.reloadCompleted();
      if (!this.completed.some((row) => row.id === op.id))
        this.completed.push(
          completedSchema.parse({
            id: op.id,
            intent: { ...intent, ...("before" in intent ? { before: "" } : {}) },
            result: op.ack,
            at: Date.now(),
          }),
        );
      // Keep parent responses while any durable child can still depend on them.
      this.storage.setItem(this.checkpoint, JSON.stringify(this.completed));
      if (backgroundActionSchema.parse(op.intent).kind === "image.generate") {
        const { imageExportStorage } = await import("../sharing/long-image/image-export-storage");
        await imageExportStorage.remove(op.id);
      }
      this.emit();
      this.queue.compactAcknowledged();
    };
    if (navigator.locks) await navigator.locks.request(this.checkpoint, write);
    else await write();
  }
}
