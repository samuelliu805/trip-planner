import type {
  ClearItineraryItemsInput,
  CopyItineraryItemsInput,
  InsertTripDayInput,
  RemoveTripDayInput,
  ReorderItineraryItemsInput,
} from "./day-schema.ts";
import type {
  CreateItineraryItemInput,
  DeleteItineraryItemInput,
  UpdateItineraryItemInput,
} from "./item-schema.ts";

type VersionedWorkspace = {
  variant: { days_version: number; items_version: number };
  days: {
    content_version: number;
    day_number: number;
    id: string;
    items_version: number;
    items: { day_id: string; id: string; version: number }[];
    version: number;
  }[];
};

const findItem = (workspace: VersionedWorkspace, id: string) =>
  workspace.days.flatMap(({ items }) => items).find((item) => item.id === id);

export function rebaseAdditiveItemCreate(
  input: CreateItineraryItemInput,
  latest: VersionedWorkspace,
): CreateItineraryItemInput | null {
  const day = latest.days.find(({ id }) => id === input.dayId);
  if (
    !day ||
    (input.insertAfterItemId && !day.items.some(({ id }) => id === input.insertAfterItemId))
  )
    return null;
  return { ...input, expectedItemsVersion: day.items_version };
}

/** Reuse the draft only when another write changed the day, not the edited item. */
export function rebaseUnchangedItemEdit(
  input: UpdateItineraryItemInput,
  latest: VersionedWorkspace,
): UpdateItineraryItemInput | null {
  const item = findItem(latest, input.id);
  if (!item || item.version !== input.expectedVersion || item.day_id !== input.dayId) return null;
  const day = latest.days.find(({ id }) => id === item.day_id);
  return day ? { ...input, expectedItemsVersion: day.items_version } : null;
}

/** Copies can follow a changed day if every source and replaced item is unchanged. */
export function rebaseUnchangedCopy(
  input: CopyItineraryItemsInput,
  latest: VersionedWorkspace,
): CopyItineraryItemsInput | null {
  const day = latest.days.find(({ id }) => id === input.targetDayId);
  if (
    !day ||
    input.sourceItemIds.length !== input.sourceVersions.length ||
    (input.replaceTargetItemIds?.length ?? 0) !== (input.replaceTargetVersions?.length ?? 0)
  )
    return null;
  if (
    input.sourceItemIds.some(
      (id, index) => findItem(latest, id)?.version !== input.sourceVersions[index],
    ) ||
    input.replaceTargetItemIds?.some(
      (id, index) =>
        day.items.find((item) => item.id === id)?.version !== input.replaceTargetVersions?.[index],
    )
  )
    return null;
  return { ...input, expectedItemsVersion: day.items_version };
}

export function rebaseUnchangedItemDelete(
  input: DeleteItineraryItemInput,
  latest: VersionedWorkspace,
): DeleteItineraryItemInput | null {
  const item = findItem(latest, input.id);
  const day = latest.days.find(({ id }) => id === item?.day_id);
  return item?.version === input.expectedVersion && day
    ? { ...input, expectedItemsVersion: day.items_version }
    : null;
}

export function rebaseUnchangedCellClear(
  input: ClearItineraryItemsInput,
  latest: VersionedWorkspace,
): ClearItineraryItemsInput | null {
  if (
    input.itemIds.length !== input.itemVersions.length ||
    input.itemIds.some((id, index) => findItem(latest, id)?.version !== input.itemVersions[index])
  )
    return null;
  return { ...input, expectedItemsVersion: latest.variant.items_version };
}

export function rebaseDayInsert(
  input: InsertTripDayInput,
  original: VersionedWorkspace | undefined,
  latest: VersionedWorkspace,
): InsertTripDayInput | null {
  if (!original) return null;
  const anchor = original.days.find(({ day_number }) => day_number === input.beforeDayNumber);
  const beforeDayNumber = anchor
    ? latest.days.find(({ id }) => id === anchor.id)?.day_number
    : input.beforeDayNumber === original.days.length + 1
      ? latest.days.length + 1
      : undefined;
  return beforeDayNumber
    ? { ...input, beforeDayNumber, expectedDaysVersion: latest.variant.days_version }
    : null;
}

export function rebaseUnchangedDayDelete(
  input: RemoveTripDayInput,
  latest: VersionedWorkspace,
): RemoveTripDayInput | null {
  const day = latest.days.find(({ id }) => id === input.dayId);
  return day &&
    day.version === input.expectedVersion &&
    day.content_version === input.expectedContentVersion
    ? { ...input, expectedDaysVersion: latest.variant.days_version }
    : null;
}

export function rebaseUnchangedItemOrder(
  input: ReorderItineraryItemsInput,
  original: VersionedWorkspace | undefined,
  latest: VersionedWorkspace,
): ReorderItineraryItemsInput | null {
  const before = original?.days.find(({ id }) => id === input.dayId);
  const after = latest.days.find(({ id }) => id === input.dayId);
  if (!before || !after || before.items.length !== after.items.length) return null;
  if (
    before.items.some(
      ({ id, version }) => after.items.find((item) => item.id === id)?.version !== version,
    )
  )
    return null;
  return { ...input, expectedItemsVersion: after.items_version };
}
