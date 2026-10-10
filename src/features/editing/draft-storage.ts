import { z } from "zod";
import { applicationDraftEntity } from "../research/application-receipt.ts";

const recordSchema = z.object({
  schema: z.literal(1),
  revision: z.number().int().nonnegative(),
  values: z.record(z.string(), z.json()),
  writer: z.string().optional(),
  dirty: z.boolean().optional(),
});
export type DraftRecord = z.infer<typeof recordSchema>;

export function editingStorageKey(scope: string[], entity: string) {
  if (typeof window !== "undefined") {
    try {
      entity = applicationDraftEntity(localStorage, scope, entity);
    } catch {
      /* The draft owner exposes inaccessible browser storage. */
    }
  }
  return `trip-planner:editing:v1:${JSON.stringify([...scope, entity])}`;
}

/** Invalid records remain in storage for recovery; they are never silently overwritten. */
export class DraftStorage {
  private storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  private writer?: string;
  constructor(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, writer?: string) {
    this.storage = storage;
    this.writer = writer;
  }

  recoveryKey(key: string) {
    return `${key}:recovery:${this.writer}`;
  }
  readRecovery(key: string): DraftRecord | null {
    const raw = this.writer ? this.storage.getItem(this.recoveryKey(key)) : null;
    return raw ? recordSchema.parse(JSON.parse(raw)) : null;
  }

  read(key: string): DraftRecord | null {
    const raw = this.storage.getItem(key);
    return raw ? recordSchema.parse(JSON.parse(raw)) : null;
  }

  write(
    key: string,
    values: DraftRecord["values"],
    expectedRevision: number | null,
    dirty?: boolean,
  ) {
    const record = recordSchema.parse({
      schema: 1,
      revision: (expectedRevision ?? 0) + 1,
      values,
      ...(this.writer && { writer: this.writer }),
      ...(dirty !== undefined && { dirty }),
    });
    // localStorage has no cross-process CAS. Preserve each writer's input before updating
    // the shared record, so simultaneous tabs can detect and recover either intention.
    if (this.writer) this.storage.setItem(this.recoveryKey(key), JSON.stringify(record));
    const previous = this.read(key);
    if ((previous?.revision ?? null) !== expectedRevision)
      throw new Error("This draft changed in another tab. Your input is kept here for recovery.");
    this.storage.setItem(key, JSON.stringify(record));
    return record;
  }

  discard(key: string, expectedRevision: number | null) {
    if ((this.read(key)?.revision ?? null) !== expectedRevision)
      throw new Error("This draft changed in another tab. Reload it before discarding.");
    this.storage.removeItem(key);
    if (this.writer) this.storage.removeItem(this.recoveryKey(key));
  }
}
