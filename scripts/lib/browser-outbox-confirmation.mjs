/** Server assertions after a cold navigation must follow durable ACK recovery. */
function tripOutboxSnapshot(tripId, domains) {
  return `(() => {
    const rows = [];
    for (const key of Object.keys(localStorage)) {
      const match = key.match(/^trip-planner:(?:[a-z-]+-)?outbox:v1:(\\[.*\\]):[^:]+$/);
      if (!match) continue;
      const scope = JSON.parse(match[1]);
      if (scope[2] !== ${JSON.stringify(tripId)}) continue;
      const op = JSON.parse(localStorage.getItem(key));
      const input = (op.wire || op.intent)?.input || {};
      rows.push({ id: op.id || key.slice(key.lastIndexOf(':') + 1), dependsOn: op.dependsOn,
        metadata: { domain: scope[3], status: op.status, attempts: op.attempts,
        hasAck: op.ack !== undefined, dependencies: op.dependsOn.length,
        counters: Object.fromEntries(['expectedVersion', 'expectedVariantVersion',
          'expectedContentVersion', 'expectedDaysVersion', 'expectedItemsVersion']
          .filter((name) => typeof input[name] === 'number').map((name) => [name, input[name]])),
        sourceVersions: Object.values(input.expectedResearchVersions || input.sourceVersions || {})
          .filter((version) => typeof version === 'number'),
        error: typeof op.error === 'string' ? op.error.slice(0, 240) : undefined } });
    }
    const related = new Set(rows.filter((row) =>
      ${JSON.stringify(domains)}.includes(row.metadata.domain)));
    for (let changed = true; changed;) {
      changed = false;
      for (const row of related)
        for (const id of row.dependsOn)
          for (const parent of rows.filter((candidate) => candidate.id === id))
            if (!related.has(parent)) { related.add(parent); changed = true; }
    }
    const operations = [...related].map((row) => row.metadata);
    return { operations, failed: operations.some((op) => ['failed', 'conflict'].includes(op.status)) };
  })()`;
}

export async function readTripOutbox(browser, tripId, { evaluate, domains }) {
  return evaluate(browser, tripOutboxSnapshot(tripId, domains));
}

/** Wait for requested operations and their actual queued predecessors, including ACK recovery. */
export async function waitForTripOutbox(browser, tripId, { evaluate, waitFor, domains, label }) {
  const snapshot = tripOutboxSnapshot(tripId, domains);
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
