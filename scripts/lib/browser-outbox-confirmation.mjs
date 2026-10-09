/** Server assertions after a cold navigation must follow durable ACK recovery. */
export async function waitForTripOutbox(browser, tripId, { evaluate, waitFor, domains, label }) {
  const snapshot = `(() => {
    const operations = [];
    for (const key of Object.keys(localStorage)) {
      const match = key.match(/^trip-planner:(?:[a-z-]+-)?outbox:v1:(\\[.*\\]):[^:]+$/);
      if (!match) continue;
      const scope = JSON.parse(match[1]);
      if (scope[2] !== ${JSON.stringify(tripId)} ||
        !${JSON.stringify(domains)}.includes(scope[3])) continue;
      const op = JSON.parse(localStorage.getItem(key));
      const input = (op.wire || op.intent)?.input || {};
      operations.push({ domain: scope[3], status: op.status, attempts: op.attempts,
        hasAck: op.ack !== undefined, dependencies: op.dependsOn.length,
        counters: Object.fromEntries(['expectedVersion', 'expectedVariantVersion',
          'expectedContentVersion', 'expectedDaysVersion', 'expectedItemsVersion']
          .filter((name) => typeof input[name] === 'number').map((name) => [name, input[name]])),
        error: typeof op.error === 'string' ? op.error.slice(0, 240) : undefined });
    }
    return { operations, failed: operations.some((op) => ['failed', 'conflict'].includes(op.status)) };
  })()`;
  let state;
  try {
    state = await waitFor(
      browser,
      `(() => { const state = ${snapshot};
        return state.failed || !state.operations.length ? state : null; })()`,
      label,
      60_000,
    );
  } catch (error) {
    state = await evaluate(browser, snapshot).catch(() => ({ unavailable: true }));
    throw new Error(`${error.message}; outbox: ${JSON.stringify(state)}`, { cause: error });
  }
  if (state.failed) throw new Error(`${label} failed; outbox: ${JSON.stringify(state.operations)}`);
}
