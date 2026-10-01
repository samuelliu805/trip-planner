type RequestQueue = {
  nextStart: number;
  tail: Promise<void>;
};

// The quota belongs to the key, so day/overall calculations and provider instances share it.
const queues = new Map<string, RequestQueue>();
const defaultIntervalMs = 1_100;

export function waitForAmapRouteSlot(apiKey: string, intervalMs = defaultIntervalMs) {
  if (intervalMs <= 0) return Promise.resolve();
  let queue = queues.get(apiKey);
  if (!queue) {
    queue = { nextStart: 0, tail: Promise.resolve() };
    queues.set(apiKey, queue);
  }
  const state = queue;
  const slot = state.tail.then(async () => {
    // Measure from the actual start, so an event-loop stall cannot release a burst.
    const delay = Math.max(0, state.nextStart - Date.now());
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    state.nextStart = Date.now() + intervalMs;
  });
  state.tail = slot;
  return slot;
}
