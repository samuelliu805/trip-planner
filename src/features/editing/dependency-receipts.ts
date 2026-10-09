/** Receipts outlive their owners, so a refresh need not mount the parent editor. */
export function hasScopeReceipt(storage: Storage, scope: string[], id: string) {
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.endsWith(`-receipt:${id}`) || storage.getItem(key) !== "1") continue;
    const match = key.match(/^trip-planner:[a-z-]+:v1:(\[.*\])-receipt:/);
    if (!match) continue;
    try {
      const owner = JSON.parse(match[1]) as string[];
      if (
        Array.isArray(owner) &&
        scope.slice(0, 3).every((value, position) => owner[position] === value)
      )
        return true;
    } catch {
      /* Corrupt receipt bytes are retained and cannot acknowledge a dependency. */
    }
  }
  return false;
}
