"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { captureBrowserProductEvent } from "@/lib/telemetry/product-client";

import { createGuestTripDraft } from "./defaults";
import type { GuestIntent, GuestRegion, GuestTripDraft } from "./schema";
import { GuestDraftStorage, GuestStorageError, guestDraftStorageKey } from "./storage";

export type GuestSaveState = {
  code: "conflict" | "dirty" | "error" | "loading" | "saved" | "saving" | "unavailable";
  message?: string;
  raw?: string;
};

const debounceMilliseconds = 500;

export function useGuestDraft(region: GuestRegion, deferInitialSave = false) {
  const [draft, setDraft] = useState<GuestTripDraft>();
  const [restoredFromStorage, setRestoredFromStorage] = useState<boolean>();
  const [saveState, setSaveState] = useState<GuestSaveState>({ code: "loading" });
  const draftRef = useRef<GuestTripDraft | undefined>(undefined);
  const storageRef = useRef<GuestDraftStorage | undefined>(undefined);
  const savedRevisionRef = useRef<number | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const blockedRef = useRef(false);
  const persistableRef = useRef(!deferInitialSave);

  const flush = useCallback(() => {
    const current = draftRef.current;
    const storage = storageRef.current;
    if (!current || !storage || blockedRef.current || !persistableRef.current) return false;
    if (current.revision === savedRevisionRef.current) {
      setSaveState({ code: "saved" });
      return true;
    }
    setSaveState({ code: "saving" });
    try {
      storage.save(current, savedRevisionRef.current);
      savedRevisionRef.current = current.revision;
      setSaveState({ code: "saved" });
      return true;
    } catch (error) {
      const failure =
        error instanceof GuestStorageError
          ? error
          : new GuestStorageError("unavailable", "This browser could not save the local draft.");
      if (["conflict", "corrupt", "incompatible"].includes(failure.code)) blockedRef.current = true;
      setSaveState({
        code:
          failure.code === "conflict"
            ? "conflict"
            : failure.code === "unavailable"
              ? "unavailable"
              : "error",
        message: failure.message,
        raw: failure.raw,
      });
      captureBrowserProductEvent(
        "guest_trip_local_save_failed",
        {
          error_code:
            failure.code === "conflict"
              ? "conflict"
              : failure.code === "corrupt" || failure.code === "incompatible"
                ? "invalid_input"
                : "storage_unavailable",
          surface: "guest_trip",
        },
        { actorType: "anonymous" },
      );
      return false;
    }
  }, []);

  const scheduleFlush = useCallback(() => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, debounceMilliseconds);
  }, [flush]);

  const commit = useCallback(
    (update: (current: GuestTripDraft) => GuestTripDraft) => {
      const current = draftRef.current;
      if (!current) throw new Error("The local draft is still loading.");
      const timestamp = new Date().toISOString();
      const nextValue = update(current);
      const next: GuestTripDraft = {
        ...nextValue,
        revision: current.revision + 1,
        trip: { ...nextValue.trip, updated_at: timestamp },
        updatedAt: timestamp,
      };
      persistableRef.current = true;
      draftRef.current = next;
      setDraft(next);
      if (storageRef.current && !blockedRef.current) {
        setSaveState({ code: "dirty" });
        scheduleFlush();
      }
      return next;
    },
    [scheduleFlush],
  );

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    try {
      const storage = new GuestDraftStorage(region, window.localStorage);
      storage.probe();
      storageRef.current = storage;
      const stored = storage.load();
      const initial = stored ?? createGuestTripDraft(region, timezone);
      draftRef.current = initial;
      persistableRef.current = Boolean(stored) || !deferInitialSave;
      savedRevisionRef.current = stored?.revision ?? null;
      window.setTimeout(() => {
        setDraft(initial);
        setRestoredFromStorage(Boolean(stored));
        setSaveState({ code: stored ? "saved" : "dirty" });
      }, 0);
      captureBrowserProductEvent(
        stored ? "guest_trip_resumed" : "guest_trip_created",
        { surface: "guest_trip" },
        { actorType: "anonymous" },
      );
      if (!stored && !deferInitialSave) window.setTimeout(flush, 0);
    } catch (error) {
      const failure =
        error instanceof GuestStorageError
          ? error
          : new GuestStorageError("unavailable", "This browser does not allow local storage.");
      const initial = createGuestTripDraft(region, timezone);
      draftRef.current = initial;
      blockedRef.current = failure.code !== "unavailable";
      window.setTimeout(() => {
        setDraft(initial);
        setRestoredFromStorage(false);
        setSaveState({
          code: failure.code === "unavailable" ? "unavailable" : "error",
          message: failure.message,
          raw: failure.raw,
        });
      }, 0);
    }
  }, [deferInitialSave, flush, region]);

  useEffect(() => {
    const saveBeforeLeaving = () => flush();
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", saveBeforeLeaving);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [flush]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== guestDraftStorageKey(region) || !event.newValue) return;
      const current = draftRef.current;
      const storage = storageRef.current;
      if (!current || !storage) return;
      try {
        const incoming = storage.load();
        if (!incoming) return;
        if (incoming.draftId !== current.draftId) {
          blockedRef.current = true;
          setSaveState({
            code: "conflict",
            message: "A different local draft already exists in this deployment region.",
          });
          return;
        }
        if (incoming.revision <= current.revision) return;
        if (current.revision !== savedRevisionRef.current) {
          blockedRef.current = true;
          setSaveState({
            code: "conflict",
            message: "A newer version of this draft was saved in another tab.",
          });
          return;
        }
        draftRef.current = incoming;
        savedRevisionRef.current = incoming.revision;
        setDraft(incoming);
        setSaveState({ code: "saved" });
      } catch {
        /* The active tab keeps its validated in-memory copy. */
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [region]);

  const reset = useCallback(() => {
    const storage = storageRef.current;
    if (!storage) return false;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    try {
      storage.clear();
      const fresh = createGuestTripDraft(region, timezone);
      storage.save(fresh, null);
      blockedRef.current = false;
      persistableRef.current = true;
      savedRevisionRef.current = fresh.revision;
      draftRef.current = fresh;
      setDraft(fresh);
      setSaveState({ code: "saved" });
      captureBrowserProductEvent(
        "guest_trip_discarded",
        { surface: "guest_trip" },
        { actorType: "anonymous" },
      );
      return true;
    } catch (error) {
      setSaveState({
        code: "unavailable",
        message: error instanceof Error ? error.message : "The local draft could not be reset.",
      });
      return false;
    }
  }, [region]);

  const retry = useCallback(() => {
    const current = draftRef.current;
    if (!current) return false;
    try {
      const storage = storageRef.current ?? new GuestDraftStorage(region, window.localStorage);
      storage.probe();
      const existing = storage.load();
      if (existing && existing.draftId !== current.draftId)
        throw new GuestStorageError(
          "conflict",
          "A different local draft already exists in this deployment region.",
        );
      storageRef.current = storage;
      blockedRef.current = false;
      persistableRef.current = true;
      savedRevisionRef.current = existing?.revision ?? null;
      return flush();
    } catch (error) {
      const failure =
        error instanceof GuestStorageError
          ? error
          : new GuestStorageError("unavailable", "This browser does not allow local storage.");
      blockedRef.current = failure.code === "conflict";
      setSaveState({
        code: failure.code === "conflict" ? "conflict" : "unavailable",
        message: failure.message,
        raw: failure.raw,
      });
      return false;
    }
  }, [flush, region]);

  const prepareSignIn = useCallback(
    (intent: Omit<GuestIntent, "createdAt" | "draftId">) => {
      const current = draftRef.current;
      const storage = storageRef.current;
      if (!current || !storage || !flush()) return false;
      try {
        storage.writeIntent({
          ...intent,
          createdAt: new Date().toISOString(),
          draftId: current.draftId,
        });
        return true;
      } catch (error) {
        setSaveState({
          code: "unavailable",
          message:
            error instanceof Error ? error.message : "The sign-in request could not be saved.",
        });
        return false;
      }
    },
    [flush],
  );

  return {
    commit,
    draft,
    flush,
    prepareSignIn,
    reset,
    restoredFromStorage,
    retry,
    saveState,
    storage: storageRef,
  };
}
