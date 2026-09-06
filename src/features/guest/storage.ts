import {
  guestImportMarkerSchema,
  guestIntentSchema,
  guestTripDraftSchema,
  migrateGuestTripDraft,
  type GuestImportMarker,
  type GuestIntent,
  type GuestRegion,
  type GuestTripDraft,
} from "./schema.ts";

const namespace = "trip-planner:guest-trip";

export function guestDraftStorageKey(region: GuestRegion) {
  return `${namespace}:${region}:active`;
}

export function guestIntentStorageKey(region: GuestRegion) {
  return `${namespace}:${region}:intent`;
}

export function guestImportMarkerStorageKey(region: GuestRegion) {
  return `${namespace}:${region}:imported`;
}

export class GuestStorageError extends Error {
  readonly code: "conflict" | "corrupt" | "incompatible" | "quota" | "unavailable";
  readonly raw?: string;

  constructor(
    code: "conflict" | "corrupt" | "incompatible" | "quota" | "unavailable",
    message: string,
    raw?: string,
  ) {
    super(message);
    this.code = code;
    this.raw = raw;
  }
}

function mappedStorageError(error: unknown, fallback: string) {
  if (error instanceof GuestStorageError) return error;
  if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22))
    return new GuestStorageError("quota", "Browser storage is full.");
  return new GuestStorageError("unavailable", fallback);
}

export class GuestDraftStorage {
  readonly region: GuestRegion;
  private readonly storage: Storage;

  constructor(region: GuestRegion, storage: Storage) {
    this.region = region;
    this.storage = storage;
  }

  probe() {
    const key = `${namespace}:${this.region}:probe`;
    try {
      this.storage.setItem(key, "1");
      this.storage.removeItem(key);
    } catch (error) {
      throw mappedStorageError(error, "This browser does not allow local storage.");
    }
  }

  load(): GuestTripDraft | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(guestDraftStorageKey(this.region));
    } catch (error) {
      throw mappedStorageError(error, "This browser does not allow reading local storage.");
    }
    if (!raw) return null;
    try {
      return migrateGuestTripDraft(JSON.parse(raw));
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error && error.code === "incompatible"
          ? "incompatible"
          : "corrupt";
      throw new GuestStorageError(
        code,
        error instanceof Error ? error.message : "Invalid draft.",
        raw,
      );
    }
  }

  save(draft: GuestTripDraft, expectedRevision: number | null) {
    const validation = guestTripDraftSchema.safeParse(draft);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      throw new GuestStorageError(
        "corrupt",
        issue
          ? `${issue.path.join(".") || "draft"}: ${issue.message}`
          : "The local draft contains invalid data.",
        JSON.stringify(draft),
      );
    }
    const parsed = validation.data as GuestTripDraft;
    try {
      const stored = this.load();
      if (stored && stored.draftId !== draft.draftId)
        throw new GuestStorageError(
          "conflict",
          "A different local draft already exists in this deployment region.",
        );
      if (stored && expectedRevision !== null && stored.revision > expectedRevision)
        throw new GuestStorageError(
          "conflict",
          "A newer version of this draft was saved in another tab.",
        );
      this.storage.setItem(guestDraftStorageKey(this.region), JSON.stringify(parsed));
    } catch (error) {
      throw mappedStorageError(error, "This browser could not save the local draft.");
    }
  }

  clear(draftId?: string) {
    if (draftId) {
      const current = this.load();
      if (current && current.draftId !== draftId) return;
    }
    try {
      this.storage.removeItem(guestDraftStorageKey(this.region));
      this.storage.removeItem(guestIntentStorageKey(this.region));
    } catch (error) {
      throw mappedStorageError(error, "This browser could not clear the local draft.");
    }
  }

  readIntent(): GuestIntent | null {
    try {
      const raw = this.storage.getItem(guestIntentStorageKey(this.region));
      return raw ? guestIntentSchema.parse(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  clearIntent(draftId?: string) {
    try {
      const intent = this.readIntent();
      if (draftId && intent && intent.draftId !== draftId) return;
      this.storage.removeItem(guestIntentStorageKey(this.region));
    } catch (error) {
      throw mappedStorageError(error, "This browser could not clear the sign-in request.");
    }
  }

  writeIntent(intent: GuestIntent) {
    try {
      this.storage.setItem(
        guestIntentStorageKey(this.region),
        JSON.stringify(guestIntentSchema.parse(intent)),
      );
    } catch (error) {
      throw mappedStorageError(error, "This browser could not preserve the sign-in request.");
    }
  }

  readImportMarker(): GuestImportMarker | null {
    try {
      const raw = this.storage.getItem(guestImportMarkerStorageKey(this.region));
      return raw ? guestImportMarkerSchema.parse(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  writeImportMarker(marker: GuestImportMarker) {
    try {
      this.storage.setItem(
        guestImportMarkerStorageKey(this.region),
        JSON.stringify(guestImportMarkerSchema.parse(marker)),
      );
    } catch (error) {
      throw mappedStorageError(error, "This browser could not record the completed import.");
    }
  }
}
