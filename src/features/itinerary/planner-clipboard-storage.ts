import {
  encodePlannerClipboard,
  parsePlannerClipboard,
  type PlannerClipboard,
} from "./grid-interactions.ts";

const clipboardKey = (tripId: string) => `trip-planner/clipboard/${tripId}`;

export function readStoredPlannerClipboard(
  storage: Pick<Storage, "getItem">,
  tripId: string,
): PlannerClipboard | null {
  try {
    const payload = parsePlannerClipboard(storage.getItem(clipboardKey(tripId)) ?? "");
    return payload?.source?.tripId === tripId ? payload : null;
  } catch {
    return null;
  }
}

export function writeStoredPlannerClipboard(
  storage: Pick<Storage, "setItem" | "removeItem">,
  tripId: string,
  payload: PlannerClipboard | null,
) {
  try {
    if (payload?.source?.tripId === tripId)
      storage.setItem(clipboardKey(tripId), encodePlannerClipboard(payload));
    else storage.removeItem(clipboardKey(tripId));
  } catch {
    // Private browsing or a storage quota may leave only the in-memory/system clipboard.
  }
}
