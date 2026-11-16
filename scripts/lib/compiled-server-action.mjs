import assert from "node:assert/strict";

export function compiledServerActionId(manifest, exportedName) {
  const actions = Object.entries(manifest.node ?? {}).filter(
    ([, action]) =>
      action.exportedName === exportedName ||
      Object.values(action.workers ?? {}).some((worker) => worker.exportedName === exportedName),
  );
  assert.equal(
    actions.length,
    1,
    `${exportedName} must resolve in the exact compiled application.`,
  );
  return actions[0][0];
}
