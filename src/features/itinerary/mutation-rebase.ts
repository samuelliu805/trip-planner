import type { CopyItineraryItemsInput } from "./day-schema.ts";
import type { UpdateItineraryItemInput } from "./item-schema.ts";

type VersionedWorkspace = {
  days: {
    id: string;
    items_version: number;
    items: { day_id: string; id: string; version: number }[];
  }[];
};

/** Reuse the draft only when another write changed the day, not the edited item. */
export function rebaseUnchangedItemEdit(
  input: UpdateItineraryItemInput,
  latest: VersionedWorkspace,
): UpdateItineraryItemInput | null {
  const item = latest.days.flatMap(({ items }) => items).find(({ id }) => id === input.id);
  if (!item || item.version !== input.expectedVersion || item.day_id !== input.dayId) return null;
  const day = latest.days.find(({ id }) => id === item.day_id);
  return day ? { ...input, expectedItemsVersion: day.items_version } : null;
}

/** An additive copy can follow a changed day if every source is still unchanged. */
export function rebaseUnchangedAdditiveCopy(
  input: CopyItineraryItemsInput,
  latest: VersionedWorkspace,
): CopyItineraryItemsInput | null {
  if (input.replaceTargetItemIds?.length) return null;
  const day = latest.days.find(({ id }) => id === input.targetDayId);
  if (!day || input.sourceItemIds.length !== input.sourceVersions.length) return null;
  const items = latest.days.flatMap(({ items }) => items);
  if (
    input.sourceItemIds.some(
      (id, index) => items.find((item) => item.id === id)?.version !== input.sourceVersions[index],
    )
  )
    return null;
  return { ...input, expectedItemsVersion: day.items_version };
}
