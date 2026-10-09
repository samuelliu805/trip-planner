const queues = new Map<string, Set<(enabled: boolean) => void>>();
const activeAccounts = new Set<string>();
export const isAccountActive = (actorId: string) => activeAccounts.has(actorId);

export function registerAccountQueue(actorId: string, toggle: (enabled: boolean) => void) {
  const owned = queues.get(actorId) ?? new Set();
  owned.add(toggle);
  queues.set(actorId, owned);
  toggle(activeAccounts.has(actorId));
}

export function suspendAccountQueues(actorId: string) {
  activeAccounts.delete(actorId);
  queues.get(actorId)?.forEach((toggle) => toggle(false));
}

export function resumeAccountQueues(actorId: string) {
  activeAccounts.add(actorId);
  queues.get(actorId)?.forEach((toggle) => {
    try {
      toggle(true);
    } catch {
      /* A damaged queue must not stop independent work. */
    }
  });
}
