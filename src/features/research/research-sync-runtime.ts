"use client";
import type { QueryClient } from "@tanstack/react-query";
import { mergeAttachmentCollection } from "../attachments/merge-attachment-collection";
import { DurableOutbox, SyncFailure, type OutboxOperation } from "../editing/outbox";
import { browserResourceLock } from "../editing/browser-resource-lock";
import { researchEditableSnapshot as fields } from "./editable-snapshot";
import { registerSyncQueue } from "../editing/sync-registry";
import { researchItemFromGuestIdea } from "../guest/idea-records";
import { createResearchItem, updateResearchItem, deleteResearchItem } from "./actions";
import { mergeIdeaSource } from "./idea-actions";
import { resolveIdeaCapture } from "./idea-capture-actions";
import {
  createResearchItemSchema,
  updateResearchItemSchema,
  deleteResearchItemSchema,
  type CreateResearchItemInput,
  type UpdateResearchItemInput,
} from "./schema";
import type { ResearchItem, ResearchWorkspaceSnapshot } from "./types";
import { validateResearchIntent } from "./sync-validation";

export type ResearchSyncIntent =
  | { kind: "create"; input: CreateResearchItemInput }
  | { kind: "update"; input: UpdateResearchItemInput; before?: string }
  | { kind: "delete"; input: Parameters<typeof deleteResearchItem>[0]; before?: string }
  | { kind: "capture"; input: Parameters<typeof resolveIdeaCapture>[0] }
  | { kind: "merge"; input: Parameters<typeof mergeIdeaSource>[0]; before?: string };
const json = (value: unknown): OutboxOperation["intent"] => JSON.parse(JSON.stringify(value));
const entityId = (intent: ResearchSyncIntent) =>
  intent.kind === "create" || intent.kind === "capture"
    ? intent.input.operationId
    : intent.kind === "merge"
      ? intent.input.researchItemId
      : intent.input.id;

export class ResearchSyncRuntime {
  readonly queue: DurableOutbox;
  private confirmed: ResearchItem[] = [];
  private removed = new Set<string>();
  private storage: Storage;
  private checkpoint: string;
  private client: QueryClient;
  private tripId: string;
  private generation = 0;
  private readSequence = 0;
  private appliedRead = 0;
  private storedBaseline?: string;
  constructor(scope: string[], client: QueryClient, storage: Storage) {
    this.client = client;
    this.storage = storage;
    this.tripId = scope[2];
    this.checkpoint = `trip-planner:ideas-baseline:v1:${JSON.stringify(scope)}`;
    this.loadCheckpoint();
    this.queue = new DurableOutbox(
      `trip-planner:ideas-outbox:v1:${JSON.stringify(scope)}`,
      storage,
      (op) => this.prepare(op),
      (wire) => this.send(wire as unknown as ResearchSyncIntent),
      (op) => this.acknowledge(op),
      () => navigator.onLine,
      browserResourceLock,
      validateResearchIntent,
    );
    this.queue.subscribe(() => this.publish());
    registerSyncQueue({ scope, queue: this.queue });
    this.queue.operations
      .filter((op) => op.status === "acknowledged")
      .forEach((op) => void this.acknowledge(op).catch(() => {}));
  }
  private loadCheckpoint() {
    const raw = this.storage.getItem(this.checkpoint) ?? "null";
    const stored = JSON.parse(raw) as { items: ResearchItem[]; removed: string[] } | null;
    if (!stored) return;
    if (!Array.isArray(stored.items) || !Array.isArray(stored.removed))
      throw new Error("The Ideas checkpoint could not be recovered.");
    if (raw !== this.storedBaseline) {
      this.generation++;
      this.storedBaseline = raw;
    }
    stored.removed.forEach((id) => this.removed.add(id));
    this.merge(stored.items);
  }
  private merge(items: ResearchItem[]) {
    const byId = new Map(this.confirmed.map((item) => [item.id, item]));
    items.forEach((item) => {
      if (this.removed.has(item.id)) return;
      const before = byId.get(item.id);
      if (!before) byId.set(item.id, item);
      else {
        const text = before.version > item.version ? before : item;
        byId.set(
          item.id,
          mergeAttachmentCollection(before, {
            ...text,
            attachments: item.attachments,
            attachments_version: item.attachments_version,
          }),
        );
      }
    });
    this.confirmed = [...byId.values()].filter((item) => !this.removed.has(item.id));
  }
  beginRead() {
    this.loadCheckpoint();
    return { generation: this.generation, sequence: ++this.readSequence };
  }
  reconcile(items: ResearchItem[], read = this.beginRead()) {
    this.loadCheckpoint();
    if (read.generation !== this.generation || read.sequence < this.appliedRead)
      return this.project();
    this.appliedRead = read.sequence;
    const present = new Set(items.map((item) => item.id));
    this.confirmed
      .filter((item) => !present.has(item.id))
      .forEach((item) => this.removed.add(item.id));
    this.merge(items);
    this.confirmed = this.confirmed.filter(
      (item) => present.has(item.id) && !this.removed.has(item.id),
    );
    this.storage.setItem(
      this.checkpoint,
      JSON.stringify({ items: this.confirmed, removed: [...this.removed] }),
    );
    return this.project();
  }
  accept(intent: ResearchSyncIntent, existing?: ResearchItem) {
    if (intent.kind === "create") createResearchItemSchema.parse(intent.input);
    if (intent.kind === "update") updateResearchItemSchema.parse(intent.input);
    if (intent.kind === "delete") deleteResearchItemSchema.parse(intent.input);
    if (existing) this.merge([existing]);
    if (!this.storage.getItem(this.checkpoint))
      this.storage.setItem(
        this.checkpoint,
        JSON.stringify({ items: this.confirmed, removed: [...this.removed] }),
      );
    const id = entityId(intent),
      current = this.project().find((item) => item.id === id);
    const dependencies = this.queue.operations
      .filter(
        (op) =>
          op.status !== "acknowledged" &&
          entityId(op.intent as unknown as ResearchSyncIntent) === id,
      )
      .map((op) => op.id);
    if (intent.kind === "update" || intent.kind === "delete" || intent.kind === "merge") {
      if (!current) throw new Error("This Idea is unavailable. Your draft is kept.");
      if (dependencies.length) {
        intent.before = fields(current);
        intent.input.expectedVersion = current.version;
      }
    }
    this.queue.enqueue(intent.input.operationId, [id], json(intent), dependencies);
    return this.project().find((item) => item.id === id);
  }
  project() {
    return this.queue.operations
      .filter((op) => op.status !== "acknowledged")
      .reduce((items, op) => {
        const intent = op.intent as unknown as ResearchSyncIntent,
          id = entityId(intent),
          existing = items.find((item) => item.id === id);
        if (intent.kind === "delete") return items.filter((item) => item.id !== id);
        if (intent.kind === "merge" && existing?.raw_share_text === intent.input.shareText.trim())
          return items;
        if (intent.kind === "merge")
          return existing
            ? items.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      version: item.version + 1,
                      note: [item.note, intent.input.shareText.trim()].filter(Boolean).join("\n"),
                      raw_share_text: [item.raw_share_text, intent.input.shareText.trim()]
                        .filter(Boolean)
                        .join("\n"),
                    }
                  : item,
              )
            : items;
        const input =
          intent.kind === "capture"
            ? {
                tripId: this.tripId,
                operationId: id,
                category: intent.input.kind === "car" ? ("rental" as const) : intent.input.kind,
                title: intent.input.title,
                sourceUrl: intent.input.sourceUrl,
                note: intent.input.shareText,
              }
            : intent.input;
        const optimistic = researchItemFromGuestIdea({
          id,
          createdAt: existing?.created_at ?? new Date(op.createdAt).toISOString(),
          values: createResearchItemSchema.parse(input),
        });
        return [
          {
            ...optimistic,
            version: (existing?.version ?? 0) + 1,
            attachments: existing?.attachments ?? [],
          },
          ...items.filter((item) => item.id !== id),
        ];
      }, this.confirmed);
  }
  confirmAttachments(
    entityId: string,
    attachments: import("../attachments/schema").OwnerAttachment[],
    attachmentsVersion?: number,
  ) {
    this.confirmed = this.confirmed.map((item) =>
      item.id === entityId && (attachmentsVersion ?? 0) >= (item.attachments_version ?? 0)
        ? { ...item, attachments, attachments_version: attachmentsVersion }
        : item,
    );
    this.storage.setItem(
      this.checkpoint,
      JSON.stringify({ items: this.confirmed, removed: [...this.removed] }),
    );
    this.publish();
  }
  private publish() {
    if (!this.queue.isEnabled) return;
    const items = this.project();
    this.client.setQueriesData<ResearchWorkspaceSnapshot>(
      { queryKey: ["research-workspace", this.tripId] },
      (current) => (current ? { ...current, items } : current),
    );
  }
  attach(items: ResearchItem[]) {
    this.merge(items);
    this.publish();
    void this.queue.pump();
  }
  reload() {
    this.loadCheckpoint();
    this.queue.reload();
    this.publish();
    void this.queue.pump();
  }
  private async prepare(operation: OutboxOperation) {
    this.loadCheckpoint();
    const intent = structuredClone(operation.intent) as unknown as ResearchSyncIntent;
    if (intent.kind === "capture") {
      const resolved = await resolveIdeaCapture(intent.input);
      if (!resolved.data) throw new SyncFailure(resolved.error);
      return json({ kind: "create", input: resolved.data });
    }
    if (
      (intent.kind === "update" || intent.kind === "delete" || intent.kind === "merge") &&
      intent.before
    ) {
      const current = this.confirmed.find((item) => item.id === entityId(intent));
      if (!current || fields(current) !== intent.before)
        throw new SyncFailure("This Idea changed elsewhere. Your draft is kept.", "conflict");
      intent.input.expectedVersion = current.version;
    }
    return json(intent);
  }
  private async send(intent: ResearchSyncIntent) {
    if (intent.kind === "capture")
      throw new Error("Capture metadata must be frozen before sending.");
    const result =
      intent.kind === "create"
        ? await createResearchItem(intent.input)
        : intent.kind === "update"
          ? await updateResearchItem(intent.input)
          : intent.kind === "delete"
            ? await deleteResearchItem(intent.input)
            : await mergeIdeaSource(intent.input);
    if (!result.data)
      throw new SyncFailure(result.error, result.code === "conflict" ? "conflict" : "failed");
    return json({ kind: intent.kind, item: result.data });
  }
  private async acknowledge(operation: OutboxOperation) {
    const ack = operation.ack as { kind: string; item: ResearchItem | { id: string } } | undefined;
    if (!ack) return;
    const checkpoint = async () => {
      this.loadCheckpoint();
      if (ack.kind === "delete") {
        this.removed.add(ack.item.id);
        this.confirmed = this.confirmed.filter((item) => item.id !== ack.item.id);
      } else this.merge([ack.item as ResearchItem]);
      this.storage.setItem(
        this.checkpoint,
        JSON.stringify({ items: this.confirmed, removed: [...this.removed] }),
      );
      this.generation++;
      this.storedBaseline = this.storage.getItem(this.checkpoint) ?? "null";
      this.publish();
    };
    if (navigator.locks) await navigator.locks.request(this.checkpoint, checkpoint);
    else await checkpoint();
    queueMicrotask(() => {
      try {
        this.queue.compactAcknowledged();
      } catch {
        /* Durable ACK survives a quota failure. */
      }
    });
  }
}
