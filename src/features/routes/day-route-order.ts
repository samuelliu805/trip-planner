import type { RouteLegMode } from "./types.ts";

export type FixedDayRouteDraft = { itemIds: string[]; legModes: RouteLegMode[] };

function connectionKey(from: string, to: string) {
  return `${from}\u0000${to}`;
}

export function fixedDayRouteDraft(
  draft: FixedDayRouteDraft,
  eligibleItemIds: string[],
  suggestedMode: RouteLegMode,
  previousHotelId?: string,
  roundTripHotelId?: string,
): FixedDayRouteDraft {
  const rankById = new Map(eligibleItemIds.map((itemId, index) => [itemId, index]));
  const countsById = draft.itemIds.reduce(
    (counts, itemId) => counts.set(itemId, (counts.get(itemId) ?? 0) + 1),
    new Map<string, number>(),
  );
  const occurrenceById = new Map<string, number>();
  const itemIds = draft.itemIds
    .map((itemId, originalIndex) => {
      const occurrence = occurrenceById.get(itemId) ?? 0;
      occurrenceById.set(itemId, occurrence + 1);
      return { itemId, occurrence, originalIndex };
    })
    .sort((left, right) => {
      const rank = ({ itemId, occurrence }: { itemId: string; occurrence: number }) => {
        if (itemId === previousHotelId) return -1;
        if (itemId === roundTripHotelId && (countsById.get(itemId) ?? 0) > 1 && occurrence === 0)
          return -0.5;
        return rankById.get(itemId) ?? Number.MAX_SAFE_INTEGER;
      };
      return rank(left) - rank(right) || left.originalIndex - right.originalIndex;
    })
    .map(({ itemId }) => itemId);
  const modesByConnection = new Map<string, RouteLegMode[]>();
  draft.legModes.forEach((mode, index) => {
    const from = draft.itemIds[index];
    const to = draft.itemIds[index + 1];
    if (!from || !to) return;
    const key = connectionKey(from, to);
    modesByConnection.set(key, [...(modesByConnection.get(key) ?? []), mode]);
  });
  const legModes = itemIds.slice(0, -1).map((from, index) => {
    const key = connectionKey(from, itemIds[index + 1]);
    return modesByConnection.get(key)?.shift() ?? suggestedMode;
  });
  return { itemIds, legModes };
}
