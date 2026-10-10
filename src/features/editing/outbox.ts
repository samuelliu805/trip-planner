import { envelopeSchema, type OutboxOperation, type JsonValue } from "./outbox-record.ts";
export type { OutboxOperation } from "./outbox-record.ts";
import { isPageLeaving } from "./page-lifecycle.ts";

export class SyncFailure extends Error {
  readonly kind: "failed" | "conflict";
  constructor(message: string, kind: "failed" | "conflict" = "failed") {
    super(message);
    this.kind = kind;
  }
}

const overlaps = (a: string[], b: string[]) =>
  a.includes("*") || b.includes("*") || a.some((key) => b.includes(key));

/** Each immutable intent has its own record; independent tabs never replace an entire queue. */
export class DurableOutbox {
  readonly prefix: string;
  private storage: Storage;
  private prepare: (operation: OutboxOperation) => Promise<JsonValue> | JsonValue;
  private send: (wire: JsonValue) => Promise<JsonValue>;
  private acknowledge: (operation: OutboxOperation) => Promise<void> | void;
  private online: () => boolean;
  private lock: <T>(name: string, action: () => Promise<T>, resources?: string[]) => Promise<T>;
  operations: OutboxOperation[] = [];
  storageError?: string;
  private listeners = new Set<() => void>();
  private active = new Set<string>();
  private enabled = true;
  private validate: (value: JsonValue) => void;
  private externalDependency: (id: string) => boolean;
  get isEnabled() {
    return this.enabled;
  }

  constructor(
    prefix: string,
    storage: Storage,
    prepare: (operation: OutboxOperation) => Promise<JsonValue> | JsonValue,
    send: (wire: JsonValue) => Promise<JsonValue>,
    acknowledge: (operation: OutboxOperation) => Promise<void> | void,
    online: () => boolean = () => true,
    lock: <T>(name: string, action: () => Promise<T>, resources?: string[]) => Promise<T> = (
      _name,
      action,
    ) => action(),
    validate: (value: JsonValue) => void = () => {},
    externalDependency: (id: string) => boolean = () => false,
  ) {
    this.prefix = prefix;
    this.storage = storage;
    this.prepare = prepare;
    this.send = send;
    this.acknowledge = acknowledge;
    this.online = online;
    this.lock = lock;
    this.validate = validate;
    this.externalDependency = externalDependency;
    this.reload();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    this.listeners.forEach((listener) => listener());
  }
  private save(operation: OutboxOperation) {
    try {
      this.storage.setItem(`${this.prefix}:${operation.id}`, JSON.stringify(operation));
    } catch (error) {
      this.storageError = error instanceof Error ? error.message : "Local storage is unavailable.";
      this.emit();
      throw error;
    }
  }

  reload() {
    try {
      const operations: OutboxOperation[] = [];
      for (let index = 0; index < this.storage.length; index++) {
        const key = this.storage.key(index);
        if (!key?.startsWith(`${this.prefix}:`)) continue;
        const operation = envelopeSchema.parse(JSON.parse(this.storage.getItem(key)!));
        this.validate(operation.intent);
        if (operation.wire) this.validate(operation.wire);
        operations.push(operation);
      }
      this.operations = operations
        .map((operation) =>
          this.active.has(operation.id)
            ? (this.operations.find((current) => current.id === operation.id) ?? operation)
            : operation,
        )
        .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
      this.storageError = undefined;
      this.emit();
    } catch (error) {
      this.storageError = `The saved queue could not be recovered: ${String(error)}`;
      this.emit();
    }
  }

  enqueue(id: string, resources: string[], intent: JsonValue, dependsOn: string[] = []) {
    this.validate(intent);
    if (this.storageError) throw new Error(this.storageError);
    const existing = this.operations.find((operation) => operation.id === id);
    if (existing) {
      if (JSON.stringify(existing.intent) !== JSON.stringify(intent))
        throw new Error("Operation IDs cannot be reused for a different edit.");
      return existing;
    }
    const operation: OutboxOperation = {
      id,
      resources,
      intent: structuredClone(intent),
      dependsOn,
      createdAt: Math.max(Date.now(), (this.operations.at(-1)?.createdAt ?? 0) + 1),
      status: "queued",
      attempts: 0,
    };
    this.save(operation); // Acceptance is only reported after the durable write succeeds.
    this.operations.push(operation);
    this.emit();
    void this.pump();
    return operation;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (enabled) void this.pump();
  }
  private completed(id: string) {
    return (
      this.operations.find((entry) => entry.id === id)?.status === "acknowledged" ||
      this.storage.getItem(`${this.prefix}-receipt:${id}`) === "1" ||
      this.externalDependency(id)
    );
  }
  async pump() {
    if (!this.enabled || !this.online() || this.storageError || isPageLeaving()) return;
    try {
      for (const operation of this.operations) {
        if (!this.enabled) break;
        if (!["queued", "sending"].includes(operation.status) || this.active.has(operation.id))
          continue;
        if (operation.dependsOn.some((id) => !this.completed(id))) continue;
        if (
          this.operations.some(
            (entry) => this.active.has(entry.id) && overlaps(entry.resources, operation.resources),
          )
        )
          continue;
        // Preserve resource ordering, including a restored in-flight request with an unknown outcome.
        if (
          this.operations.some(
            (entry) =>
              entry.createdAt < operation.createdAt &&
              ["queued", "sending"].includes(entry.status) &&
              overlaps(entry.resources, operation.resources) &&
              entry.dependsOn.every((id) => this.completed(id)),
          )
        )
          continue;
        this.active.add(operation.id);
        void this.run(operation).finally(() => {
          this.active.delete(operation.id);
          void this.pump();
        });
      }
    } catch (error) {
      this.storageError = `The queue could not read local storage: ${String(error)}`;
      this.emit();
    }
  }

  private async run(operation: OutboxOperation) {
    try {
      await this.lock(
        this.prefix,
        async () => {
          if (!this.enabled || !this.online() || isPageLeaving()) return;
          const raw = this.storage.getItem(`${this.prefix}:${operation.id}`);
          if (
            !raw &&
            (this.completed(operation.id) ||
              this.storage.getItem(`${this.prefix}-archive:${operation.id}`))
          ) {
            this.reload();
            return;
          }
          let stored: OutboxOperation;
          try {
            stored = envelopeSchema.parse(JSON.parse(raw!));
            this.validate(stored.intent);
            if (stored.wire) this.validate(stored.wire);
            if (
              stored.id !== operation.id ||
              JSON.stringify(stored.intent) !== JSON.stringify(operation.intent)
            )
              throw new Error("The saved operation identity or intent changed.");
          } catch (error) {
            this.storageError = `The saved operation could not be recovered: ${String(error)}`;
            this.emit();
            return; // Preserve damaged bytes rather than overwrite them with a failed row.
          }
          if (stored.status === "acknowledged" || stored.ack !== undefined) {
            Object.assign(operation, stored);
            operation.status = "acknowledged";
            this.save(operation);
            await this.acknowledge(operation);
            this.emit();
            return;
          }
          if (stored.status === "failed" || stored.status === "conflict") {
            Object.assign(operation, stored);
            this.emit();
            return;
          }
          // A replay always uses the stored wire bytes; version rebasing only precedes the first send.
          operation.wire = stored.wire ?? (await this.prepare(operation));
          if (!this.enabled || !this.online() || isPageLeaving()) return;
          operation.status = "sending";
          operation.attempts = stored.attempts + 1;
          this.save(operation);
          this.emit();
          const ack = await this.send(structuredClone(operation.wire));
          operation.ack = ack;
          operation.status = "acknowledged";
          operation.error = undefined;
          this.save(operation);
          await this.acknowledge(operation);
          this.emit();
        },
        operation.resources,
      );
    } catch (error) {
      // Navigation can interrupt preparation, transport, or local ACK recovery. Each stage has
      // already persisted its recoverable state; the next document resumes it without a new ID.
      if (isPageLeaving()) return;
      operation.status = error instanceof SyncFailure ? error.kind : "failed";
      operation.error = error instanceof Error ? error.message : String(error);
      try {
        this.save(operation);
      } catch {
        /* Retain the in-memory input and last durable wire. */
      }
      this.emit();
    }
  }

  retry(id: string) {
    const operation = this.operations.find((entry) => entry.id === id);
    if (!operation || operation.status === "acknowledged" || this.active.has(id)) return;
    operation.status = "queued";
    operation.error = undefined;
    this.save(operation);
    this.emit();
    void this.pump();
  }

  requireManualReplay(message: string) {
    for (const operation of this.operations) {
      if (operation.status !== "sending" || this.active.has(operation.id)) continue;
      operation.status = "failed";
      operation.error = message;
      this.save(operation);
    }
    this.emit();
  }

  dependentBranch(id: string) {
    const ids = new Set([id]);
    for (let size = 0; size !== ids.size;) {
      size = ids.size;
      this.operations.forEach((operation) => {
        if (operation.dependsOn.some((dependency) => ids.has(dependency))) ids.add(operation.id);
      });
    }
    return this.operations.filter((operation) => ids.has(operation.id));
  }

  archiveBranch(id: string) {
    const branch = this.dependentBranch(id);
    if (branch.some((operation) => this.active.has(operation.id)))
      throw new Error("Wait for this operation to finish before resolving it.");
    for (const operation of branch)
      this.storage.setItem(`${this.prefix}-archive:${operation.id}`, JSON.stringify(operation));
    for (const operation of branch) this.storage.removeItem(`${this.prefix}:${operation.id}`);
    const ids = new Set(branch.map((operation) => operation.id));
    this.operations = this.operations.filter((operation) => !ids.has(operation.id));
    this.emit();
  }

  /** Call only after the owner has durably checkpointed every acknowledged result. */
  compactAcknowledged() {
    const acknowledged = new Set(
      this.operations.filter(({ status }) => status === "acknowledged").map(({ id }) => id),
    );
    for (const operation of this.operations.filter(({ status }) => status !== "acknowledged")) {
      const dependencies = operation.dependsOn.filter((id) => !acknowledged.has(id));
      if (dependencies.length === operation.dependsOn.length) continue;
      operation.dependsOn = dependencies;
      this.save(operation);
    }
    // Another tab may have persisted a dependent intent after this tab's last reload.
    // Keep a small receipt so it can prove completion even after the ACK is compacted.
    for (const id of acknowledged) {
      this.storage.setItem(`${this.prefix}-receipt:${id}`, "1");
      this.storage.removeItem(`${this.prefix}:${id}`);
    }
    this.operations = this.operations.filter(({ id }) => !acknowledged.has(id));
    this.emit();
  }
}
