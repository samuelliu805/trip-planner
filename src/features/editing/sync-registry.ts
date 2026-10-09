import type { DurableOutbox } from "./outbox";

export type RegisteredSync = {
  scope: string[];
  queue: DurableOutbox;
  reapply?: (id: string) => Promise<void>;
};
const entries = new Map<string, RegisteredSync>(),
  listeners = new Set<() => void>();
let revision = 0;
const emit = () => {
  revision++;
  listeners.forEach((listener) => listener());
};
export type LocalActivity = {
  scope: string[];
  state: "draft" | "local-failure" | "working" | "pending" | "failed";
  error?: string;
};
const activities = new Map<string, LocalActivity>();
export function setLocalActivity(key: string, activity?: LocalActivity) {
  if (JSON.stringify(activities.get(key)) === JSON.stringify(activity)) return;
  if (activity) activities.set(key, activity);
  else activities.delete(key);
  emit();
}
export function tripLocalActivities(scope: string[]) {
  return [...activities.values()].filter((entry) =>
    scope
      .slice(0, 3)
      .every((value, index) => (index === 2 && !value) || entry.scope[index] === value),
  );
}
export function recoverDraftActivities(storage: Storage, actorId: string) {
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith("trip-planner:editing:v1:") || key.includes(":recovery:")) continue;
    try {
      const scope = JSON.parse(key.slice("trip-planner:editing:v1:".length)) as string[];
      if (scope[1] !== actorId || scope[0] !== (process.env.NEXT_PUBLIC_APP_REGION ?? "global"))
        continue;
      const record = JSON.parse(storage.getItem(key) ?? "null");
      if (record?.dirty) setLocalActivity(key, { scope, state: "draft" });
    } catch {
      /* Corrupt records remain untouched for recovery in the relevant editor. */
    }
  }
}
export function registerSyncQueue(entry: RegisteredSync) {
  if (entries.has(entry.queue.prefix)) return;
  entries.set(entry.queue.prefix, entry);
  entry.queue.subscribe(emit);
  emit();
}
export const subscribeSync = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const syncRevision = () => revision;
export function tripSyncQueues(scope: string[]) {
  return [...entries.values()].filter((entry) =>
    scope
      .slice(0, 3)
      .every((value, index) => (index === 2 && !value) || entry.scope[index] === value),
  );
}
