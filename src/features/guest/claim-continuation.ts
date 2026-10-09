import type { GuestTripDraft } from "./schema.ts";

/** Each request has an explicit cutoff. Edits after that cutoff stay local until a
 * separate idempotent continuation confirms them; failures never remove the copy. */
export async function claimCurrentGuestDraft<T>({
  getCurrent,
  flush,
  send,
  complete,
}: {
  getCurrent: () => GuestTripDraft | undefined;
  flush: () => boolean;
  send: (draft: GuestTripDraft) => Promise<{ data?: T; error?: string }>;
  complete: (draft: GuestTripDraft, result: T) => boolean;
}): Promise<T> {
  for (let revision = 0; revision < 64; revision++) {
    const draft = getCurrent();
    if (!draft) throw new Error("The local trip is unavailable.");
    if (!flush())
      throw new Error("Save this local draft before importing it. Your input is kept here.");
    const cutoff = structuredClone(draft);
    const result = await send(cutoff);
    if (!result.data) throw new Error(result.error ?? "The local trip could not be imported.");
    if (getCurrent()?.revision !== cutoff.revision) continue;
    if (complete(cutoff, result.data)) return result.data;
    throw new Error("This draft changed in another tab. Your local copy is kept for recovery.");
  }
  throw new Error(
    "New edits are still arriving. The account copy is saved; retry to transfer the remaining local edits.",
  );
}

export function transferGuestEditorDrafts(
  storage: Storage,
  draftId: string,
  tripId: string,
  actorId: string,
) {
  const entries: Array<[string, string]> = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith("trip-planner:editing:v1:")) continue;
    const [tuple, recovery] = key.slice("trip-planner:editing:v1:".length).split(":recovery:");
    const scope = JSON.parse(tuple) as string[];
    if (scope[1] !== "guest" || scope[2] !== draftId) continue;
    scope[1] = actorId;
    scope[2] = tripId;
    const target = `trip-planner:editing:v1:${JSON.stringify(scope)}${recovery ? `:recovery:${recovery}` : ""}`;
    const source = storage.getItem(key)!;
    const existing = storage.getItem(target);
    if (existing !== null && existing !== source)
      throw new Error("An account draft already exists. The Guest draft is kept for recovery.");
    entries.push([target, source]);
  }
  entries.forEach(([key, value]) => storage.setItem(key, value));
  // Preserve the Guest records too: another tab may still be editing its draft.
}
