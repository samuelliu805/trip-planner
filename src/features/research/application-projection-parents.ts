import type { ApplicationProjection } from "./application-projection";
import { overlayApplicationFields } from "./application-child-receipt.ts";
import { readApplicationReceipt } from "./application-receipt.ts";
import { rebaseApplicationSnapshot } from "./application-snapshot-receipt.ts";

/** Keep an accepted preview immutable while its predecessors acquire canonical identities. */
export function bindApplicationProjectionParents(
  projection: ApplicationProjection,
  parents: string[],
  scope: string[],
  storage: Storage,
): ApplicationProjection {
  let bound = structuredClone(projection);
  for (const parent of new Set(parents)) {
    const receipt = readApplicationReceipt(storage, scope, parent);
    if (!receipt) continue;
    const id = (value: string) => receipt.ids[value] ?? value;
    bound = {
      ...bound,
      days: bound.days.map((day) => ({ ...day, id: id(day.id) })),
      items: bound.items.map((item) => {
        const pair = receipt.pairs.find(({ preview }) => preview.id === item.id);
        const row = pair
          ? (overlayApplicationFields(pair.confirmed, pair.preview, item) as typeof item)
          : item;
        return { ...row, id: id(item.id), day_id: id(item.day_id) };
      }),
      bindings: bound.bindings.map((binding) => ({ ...binding, id: id(binding.id) })),
      removedIds: bound.removedIds.map(id),
      removedDayIds: bound.removedDayIds?.map(id),
    };
  }
  if (bound.previewSnapshot)
    bound.previewSnapshot = rebaseApplicationSnapshot(
      bound.previewSnapshot,
      parents,
      scope,
      storage,
    );
  return bound;
}
