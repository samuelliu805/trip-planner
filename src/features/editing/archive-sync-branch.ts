import type { RegisteredSync } from "./sync-registry";

/** Keep immutable recovery bytes and stop every descendant, including another domain queue. */
export function archiveSyncBranch(entries: RegisteredSync[], owner: RegisteredSync, id: string) {
  const ids = new Set(owner.queue.dependentBranch(id).map((op) => op.id));
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const entry of entries)
      for (const op of entry.queue.operations)
        if (!ids.has(op.id) && op.dependsOn.some((parent) => ids.has(parent))) {
          for (const child of entry.queue.dependentBranch(op.id)) ids.add(child.id);
          expanded = true;
        }
  }
  for (const entry of entries)
    for (const op of [...entry.queue.operations])
      if (ids.has(op.id)) entry.queue.archiveBranch(op.id);
}
