"use client";

import { loadLatestAttachments } from "./actions";
import { hasScopeReceipt } from "../editing/dependency-receipts";
import { uploadFileAttachment, commitAttachmentUploadSession } from "./upload-client";
import { uploadStorage, validStoredUpload, type StoredUpload } from "./upload-storage";
import type { UploadTask } from "./components/attachment-upload-task";
import type { OwnerAttachment } from "./schema";
import { registerAccountQueue } from "../editing/account-runtime";
import { subscribeSync, tripSyncQueues, setLocalActivity } from "../editing/sync-registry";
import { applicationEntityId } from "../research/application-receipt";

export class UploadOwner {
  tasks: UploadTask[] = [];
  completed: OwnerAttachment[] = [];
  error?: string;
  private records = new Map<string, StoredUpload>();
  private active = new Set<string>();
  private durable = new Set<string>();
  get hasUnpersistedFiles() {
    return this.tasks.some((task) => !this.durable.has(task.id));
  }
  private listeners = new Set<() => void>();
  private enabled = false;
  private revision = 0;
  constructor(
    readonly scope: string[],
    readonly entityId: string,
    readonly sessionId: string,
    readonly target: StoredUpload["target"],
  ) {
    registerAccountQueue(scope[1], (enabled) => {
      this.enabled = enabled;
      if (enabled) void this.pump();
    });
    subscribeSync(() => {
      void this.pump();
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.revision;
  private emit() {
    this.revision++;
    this.listeners.forEach((listener) => listener());
    const key = JSON.stringify(["upload", this.scope, this.entityId, this.sessionId]);
    setLocalActivity(
      key,
      this.error
        ? { scope: this.scope, state: "local-failure", error: this.error }
        : this.tasks.some((task) => task.error)
          ? { scope: this.scope, state: "failed" }
          : this.tasks.length
            ? { scope: this.scope, state: this.active.size ? "working" : "pending" }
            : undefined,
    );
  }
  async restore(records: StoredUpload[]) {
    for (const record of records) {
      if (
        record.entityId !== this.entityId ||
        record.sessionId !== this.sessionId ||
        JSON.stringify(record.scope) !== JSON.stringify(this.scope)
      )
        continue;
      if (this.records.has(record.id)) continue;
      if (!validStoredUpload(record)) {
        this.error =
          "A saved upload is damaged. Its recovery data is kept; other files can still be uploaded.";
        continue;
      }
      this.records.set(record.id, record);
      this.durable.add(record.id);
      this.tasks.push({
        ...record,
        controller: new AbortController(),
        progress: { stage: "hashing", percent: 0 },
      });
    }
    this.emit();
  }
  enable() {
    this.enabled = true;
    void this.pump();
  }
  async enqueue(files: File[], parentOperationId?: string) {
    const applicationParent = tripSyncQueues(this.scope)
      .flatMap(({ queue }) => queue.operations)
      .find((op) => {
        const intent = op.intent as { projection?: { items: Array<{ id: string }> } };
        return intent.projection?.items.some((item) => item.id === this.entityId);
      });
    parentOperationId ??= applicationParent?.id;
    parentOperationId ??= tripSyncQueues(this.scope)
      .flatMap((entry) => entry.queue.operations)
      .find(
        (op) =>
          op.status !== "acknowledged" &&
          (op.id === this.entityId ||
            (op.intent as { input?: { copiedItemIds?: string[] } }).input?.copiedItemIds?.includes(
              this.entityId,
            )),
      )?.id;
    for (const file of files) {
      const record: StoredUpload = {
        id: crypto.randomUUID(),
        operationId: crypto.randomUUID(),
        commitOperationId: crypto.randomUUID(),
        scope: this.scope,
        entityId: this.entityId,
        sessionId: this.sessionId,
        target: this.target,
        file,
        ...(parentOperationId && { parentOperationId }),
        ...(applicationParent && { applicationParent: true }),
      };
      // Retain the File in memory even if IndexedDB fails; never claim it is recoverable then.
      this.records.set(record.id, record);
      const task: UploadTask = {
        ...record,
        controller: new AbortController(),
        progress: { stage: "hashing", percent: 0 },
      };
      this.tasks.push(task);
      this.active.add(record.id);
      try {
        await uploadStorage.put(record);
        this.durable.add(record.id);
      } catch {
        task.error =
          "This browser could not save the file locally. Keep this page open and retry or download the file.";
        this.error = task.error;
      } finally {
        this.active.delete(record.id);
      }
      this.emit();
    }
    void this.pump();
  }
  async retry(id: string) {
    const record = this.records.get(id),
      task = this.tasks.find((task) => task.id === id);
    if (!record || !task || this.active.has(id)) return;
    try {
      delete record.error;
      delete task.error;
      task.controller = new AbortController();
      await uploadStorage.put(record);
      this.durable.add(record.id);
      this.error = undefined;
      this.emit();
      void this.pump();
    } catch {
      task.error = "This browser could not save the file locally.";
      this.error = task.error;
      this.emit();
    }
  }
  async cancel(id: string) {
    if (this.records.get(id)?.binding) {
      this.error =
        "The file binding has an unknown outcome. Retry it to confirm the result before removing the attachment.";
      this.emit();
      return;
    }
    this.tasks.find((task) => task.id === id)?.controller.abort();
    try {
      await uploadStorage.remove(id);
      this.records.delete(id);
      this.durable.delete(id);
      this.tasks = this.tasks.filter((task) => task.id !== id);
      this.emit();
    } catch {
      this.error = "The saved upload could not be removed. Retry cancellation.";
      this.emit();
    }
  }
  private parentReady(record: StoredUpload) {
    if (!record.parentOperationId) return true;
    if (
      record.applicationParent &&
      !applicationEntityId(localStorage, this.scope, record.parentOperationId, record.entityId)
    )
      return false;
    return (
      hasScopeReceipt(localStorage, this.scope, record.parentOperationId) ||
      tripSyncQueues(this.scope).some(
        ({ queue }) =>
          queue.operations.some(
            (op) => op.id === record.parentOperationId && op.status === "acknowledged",
          ) || localStorage.getItem(`${queue.prefix}-receipt:${record.parentOperationId}`) === "1",
      )
    );
  }
  private async pump() {
    if (!this.enabled || !navigator.onLine || this.active.size) return;
    let task: UploadTask | undefined;
    try {
      task = this.tasks.find((task) => !task.error && this.parentReady(this.records.get(task.id)!));
    } catch {
      this.error = "The saved entity dependency could not be recovered.";
      this.emit();
      return;
    }
    if (!task) return;
    this.active.add(task.id);
    const run = () => this.run(task);
    try {
      if (navigator.locks) await navigator.locks.request(`trip-planner:upload:${task.id}`, run);
      else await run();
    } catch (error) {
      task.error = error instanceof Error ? error.message : "The upload failed. Retry safely.";
      const record = this.records.get(task.id);
      if (record) {
        record.error = task.error;
        try {
          await uploadStorage.put(record);
        } catch {
          this.error = "Upload recovery could not be saved.";
        }
      }
      this.emit();
    } finally {
      this.active.delete(task.id);
      this.emit();
      void this.pump();
    }
  }
  private async run(task: UploadTask) {
    const record = this.records.get(task.id);
    if (!record || !this.enabled || task.controller.signal.aborted) return;
    // Another tab may have finished the same task while this tab waited on its lock.
    const stored = (await uploadStorage.all()).find((row) => row.id === task.id);
    if (!stored) {
      this.records.delete(task.id);
      this.tasks = this.tasks.filter((row) => row.id !== task.id);
      this.emit();
      return;
    }
    Object.assign(record, stored);
    const entityId =
      record.applicationParent && record.parentOperationId
        ? applicationEntityId(localStorage, this.scope, record.parentOperationId, record.entityId)
        : record.entityId;
    if (!entityId) return;
    if (record.error) {
      task.error = record.error;
      this.emit();
      return;
    }
    if (!record.expectedVersion) {
      const latest = await loadLatestAttachments({
        entityId,
        target: record.target,
        tripId: this.scope[2],
      });
      if (!latest.data) throw new Error(latest.error);
      record.expectedVersion = latest.version;
      await uploadStorage.put(record);
    }
    if (!this.enabled || task.controller.signal.aborted) return;
    const target =
      record.target === "research" ? { researchItemId: entityId } : { itemId: entityId };
    if (!record.uploaded) {
      await uploadFileAttachment({
        ...target,
        expectedVersion: record.expectedVersion,
        file: record.file,
        operationId: record.operationId,
        tripId: this.scope[2],
        uploadSessionId: record.sessionId,
        signal: task.controller.signal,
        resumeUploaded: record.bytesUploaded,
        onUploaded: async () => {
          record.bytesUploaded = true;
          if (this.records.has(task.id)) await uploadStorage.put(record);
        },
        onProgress: (progress) => {
          task.progress = progress;
          this.emit();
        },
      });
      record.uploaded = true;
      if (!this.records.has(task.id)) return;
      await uploadStorage.put(record);
    }
    if (!this.enabled || task.controller.signal.aborted) return;
    record.binding = true;
    await uploadStorage.put(record);
    const attachments = await commitAttachmentUploadSession({
      ...target,
      tripId: this.scope[2],
      uploadSessionId: record.sessionId,
      operationId: record.commitOperationId,
    });
    this.completed = attachments;
    await uploadStorage.remove(task.id);
    this.records.delete(task.id);
    this.durable.delete(task.id);
    this.tasks = this.tasks.filter((row) => row.id !== task.id);
    this.emit();
    if (this.enabled)
      window.dispatchEvent(
        new CustomEvent("trip-planner:attachments-updated", {
          detail: {
            scope: this.scope,
            target: record.target,
            tripId: this.scope[2],
            entityId,
            attachments,
            attachmentsVersion: attachments.attachmentsVersion,
          },
        }),
      );
  }
  consumeCompleted() {
    const completed = this.completed;
    this.completed = [];
    return completed;
  }
}
