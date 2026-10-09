import { placeSnapshotFromJson, type PlaceSnapshot } from "../../lib/providers/places/types.ts";
import { setLocalActivity } from "../editing/sync-registry.ts";

export type PlaceResolution = {
  id: string;
  query: string;
  before: string;
  state: "working" | "ready" | "failed" | "interrupted" | "cancelled";
  result?: PlaceSnapshot;
  error?: string;
};
const owners = new Map<string, PlaceResolutionOwner>();

/** The paid request belongs to the field scope, independently of its mounted editor. */
export class PlaceResolutionOwner {
  private listeners = new Set<() => void>();
  private current: PlaceResolution | null = null;
  private activeId?: string;
  private persistenceError?: string;
  readonly storageKey: string;
  constructor(
    fieldKey: string,
    private scope: string[],
    private storage: Pick<Storage, "getItem" | "setItem">,
  ) {
    this.storageKey = `trip-planner:place-resolution:v1:${fieldKey}`;
    this.reload();
    if (this.current?.state === "working") {
      this.current = {
        ...this.current,
        state: "interrupted",
        error: "The place could not be selected.",
      };
      this.write();
    }
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.current;
  reload() {
    const bytes = this.storage.getItem(this.storageKey);
    const next = bytes ? (JSON.parse(bytes) as PlaceResolution) : null;
    if (
      next &&
      (typeof next.id !== "string" ||
        typeof next.query !== "string" ||
        typeof next.before !== "string" ||
        !["working", "ready", "failed", "interrupted", "cancelled"].includes(next.state) ||
        (next.state === "ready" && !placeSnapshotFromJson(next.result)))
    )
      throw new Error("The saved place result could not be recovered.");
    if (JSON.stringify(next) !== JSON.stringify(this.current)) {
      this.current = next;
      this.emit();
    }
  }
  private emit() {
    setLocalActivity(
      this.storageKey,
      this.persistenceError
        ? { scope: this.scope, state: "local-failure", error: this.persistenceError }
        : this.current?.state === "working"
          ? { scope: this.scope, state: "working" }
          : this.current?.state === "failed" || this.current?.state === "interrupted"
            ? { scope: this.scope, state: "failed", error: this.current.error }
            : undefined,
    );
    this.listeners.forEach((listener) => listener());
  }
  private write() {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.current));
      this.persistenceError = undefined;
    } catch (error) {
      this.persistenceError = String(error);
      if (this.current) this.current = { ...this.current, error: this.persistenceError };
      throw error;
    } finally {
      this.emit();
    }
  }
  invalidate() {
    this.reload();
    if (!this.current || this.current.state === "cancelled") return;
    this.current = { ...this.current, state: "cancelled" };
    this.write();
  }
  start(query: string, before: PlaceSnapshot | null, resolve: () => Promise<PlaceSnapshot>) {
    this.reload();
    if (this.activeId === this.current?.id && this.current?.state === "working")
      throw new Error("Loading place details…");
    const id = crypto.randomUUID();
    this.current = { id, query, before: JSON.stringify(before), state: "working" };
    // Never incur a paid request before reliably recording the user's explicit intent.
    this.write();
    this.activeId = id;
    void resolve()
      .then((result) => {
        if (!placeSnapshotFromJson(result)) throw new Error("The place could not be selected.");
        this.finish(id, { state: "ready", result });
      })
      .catch((error) => {
        this.finish(id, { state: "failed", error: String(error) });
      })
      .finally(() => {
        if (this.activeId === id) this.activeId = undefined;
      });
  }
  private finish(id: string, changes: Partial<PlaceResolution>) {
    // A newer selection/input in another tab owns the shared checkpoint.
    let stored: PlaceResolution | null;
    try {
      stored = JSON.parse(this.storage.getItem(this.storageKey) ?? "null");
    } catch (error) {
      this.persistenceError = String(error);
      if (this.current?.id === id) this.current = { ...this.current, ...changes };
      this.emit();
      return;
    }
    if (stored?.id !== id || stored.state === "cancelled" || this.current?.id !== id) return;
    this.current = { ...this.current, ...changes };
    try {
      this.write();
    } catch {
      // Keep the actual result in memory; persistence failure must not repeat a paid request.
    }
  }
}

export function ownedPlaceResolution(fieldKey: string, scope: string[]) {
  const key = JSON.stringify([scope[0], scope[1], fieldKey]);
  let owner = owners.get(key);
  if (!owner) {
    owner = new PlaceResolutionOwner(key, scope, localStorage);
    owners.set(key, owner);
  }
  return owner;
}
