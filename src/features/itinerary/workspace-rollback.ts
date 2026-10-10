import type { PlannerWorkspace } from "./types";

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const identified = (value: unknown): value is { id: string }[] =>
  Array.isArray(value) && value.every((entry) => record(entry) && typeof entry.id === "string");

/** Undo only fields still owned by the failing operation; later edits and unrelated entities survive. */
function undo(before: unknown, after: unknown, current: unknown): unknown {
  if (same(before, after)) return current;
  if (same(current, after)) return before;
  if (identified(before) && identified(after) && identified(current)) {
    const old = new Map(before.map((entry) => [entry.id, entry]));
    const applied = new Map(after.map((entry) => [entry.id, entry]));
    const now = new Map(current.map((entry) => [entry.id, entry]));
    const result = current.flatMap((entry) => {
      if (!old.has(entry.id) && applied.has(entry.id) && same(entry, applied.get(entry.id)))
        return [];
      return [undo(old.get(entry.id), applied.get(entry.id), entry)];
    });
    for (const entry of before)
      if (!applied.has(entry.id) && !now.has(entry.id)) result.push(entry);
    return result;
  }
  if (record(before) && record(after) && record(current)) {
    const result = { ...current };
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const value = undo(before[key], after[key], current[key]);
      if (value === undefined) delete result[key];
      else result[key] = value;
    }
    return result;
  }
  return current;
}

export function rollbackWorkspaceChange(
  current: PlannerWorkspace | undefined,
  before: PlannerWorkspace | undefined,
  after: PlannerWorkspace | undefined,
) {
  return current && before && after ? (undo(before, after, current) as PlannerWorkspace) : current;
}
