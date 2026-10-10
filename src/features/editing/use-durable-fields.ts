"use client";

import { useEffect, useRef, useState, type SetStateAction } from "react";
import { DraftStorage, type DraftRecord } from "./draft-storage";
import { draftWriter } from "./draft-writer";
import { setLocalActivity } from "./sync-registry";

const retainedInputs = new Map<string, { values: Record<string, unknown>; error?: string }>();

/** Field setters persist synchronously, including composition events and the final keystroke. */
export function useDurableFields<T extends Record<string, unknown>>(
  key: string,
  defaults: T,
  options?: { ignoreDirty?: string[]; validate?: (values: Record<string, unknown>) => void },
) {
  const [initial] = useState(() => {
    if (typeof window === "undefined")
      return { values: defaults, revision: null, error: undefined };
    const retained = retainedInputs.get(key);
    try {
      const store = new DraftStorage(window.localStorage, draftWriter());
      const canonical = store.read(key);
      const own = store.readRecovery(key);
      const contested =
        own &&
        canonical &&
        canonical.writer !== draftWriter() &&
        JSON.stringify(own.values) !== JSON.stringify(canonical.values);
      const stored = contested ? own : canonical;
      if (stored) options?.validate?.(stored.values);
      // Only fields with compatible primitive/container shapes can enter a form.
      const recovered = Object.fromEntries(
        Object.entries(defaults).map(([field, fallback]) => {
          const value = stored?.values[field];
          const compatible =
            value !== undefined &&
            (fallback === null
              ? true
              : Array.isArray(fallback)
                ? Array.isArray(value)
                : typeof value === typeof fallback);
          return [field, compatible ? value : fallback];
        }),
      ) as T;
      return {
        values: (retained?.values as T | undefined) ?? recovered,
        baseline: stored?.dirty === false && !retained ? recovered : defaults,
        revision: canonical?.revision ?? null,
        error:
          retained?.error ??
          (contested
            ? "This draft changed in another tab. Your input is kept here for recovery."
            : undefined),
      };
    } catch (error) {
      return {
        values: (retained?.values as T | undefined) ?? defaults,
        revision: null,
        error: retained?.error ?? String(error),
      };
    }
  });
  const [values, setValues] = useState(initial.values);
  const [error, setError] = useState<string | undefined>(initial.error);
  const [saved, setSaved] = useState(initial.revision !== null && !initial.error);
  const current = useRef(values);
  const revision = useRef<number | null>(initial.revision);
  const failure = useRef(initial.error);
  const [baseline, setBaseline] = useState(initial.baseline ?? defaults);
  const baselineRef = useRef(initial.baseline ?? defaults);

  function persist(next: T, dirty = changed(next, baselineRef.current)) {
    try {
      if (failure.current) throw new Error(failure.current);
      const record = new DraftStorage(window.localStorage, draftWriter()).write(
        key,
        JSON.parse(JSON.stringify(next)) as DraftRecord["values"],
        revision.current,
        dirty,
      );
      revision.current = record.revision;
      retainedInputs.delete(key);
      setSaved(true);
      setError(undefined);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "This browser could not save the draft.";
      failure.current = message;
      retainedInputs.set(key, { values: next, error: message });
      setSaved(false);
      setError(message);
      return false;
    }
  }

  function set<K extends keyof T>(field: K, update: SetStateAction<T[K]>) {
    const value =
      typeof update === "function"
        ? (update as (value: T[K]) => T[K])(current.current[field])
        : update;
    const next = { ...current.current, [field]: value };
    current.current = next;
    retainedInputs.set(key, { values: next });
    setValues(next);
    persist(next);
  }

  function discard() {
    try {
      new DraftStorage(window.localStorage, draftWriter()).discard(key, revision.current);
      retainedInputs.delete(key);
      revision.current = null;
      failure.current = undefined;
      setError(undefined);
      setSaved(false);
      baselineRef.current = current.current;
      setBaseline(current.current);
      setLocalActivity(key);
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      failure.current = "This draft changed in another tab. Your input is kept here for recovery.";
      setError(failure.current);
      setSaved(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  function retry() {
    failure.current = undefined;
    return persist(current.current);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(current.current, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "therewego-draft.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  const changed = (next: T, before = baseline) =>
    Object.keys(defaults).some(
      (field) =>
        !options?.ignoreDirty?.includes(field) &&
        JSON.stringify(next[field]) !== JSON.stringify(before[field]),
    );
  useEffect(() => {
    const scope = JSON.parse(key.slice("trip-planner:editing:v1:".length)) as string[];
    setLocalActivity(
      key,
      error
        ? { scope, state: "local-failure", error }
        : changed(values)
          ? { scope, state: "draft" }
          : undefined,
    );
    // Keep unfinished drafts registered after the editor closes. Successful acceptance removes them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, values, error, saved, baseline]);
  return {
    key,
    values,
    set,
    saved,
    error,
    discard,
    checkpoint: (keepDirty = false) => {
      // Keep form identity and other page drafts through refresh. Commit the new
      // baseline only after the same CAS write that preserves those values.
      if (!persist(current.current, keepDirty)) return false;
      if (!keepDirty) {
        baselineRef.current = current.current;
        setBaseline(current.current);
      }
      return true;
    },
    reset: (next: T) => {
      if (!discard()) return false;
      current.current = next;
      baselineRef.current = next;
      setValues(next);
      setBaseline(next);
      return true;
    },
    retry,
    dirty: changed(values),
    download,
    getValues: () => current.current,
    getError: () => failure.current,
    discardIfMatches: (snapshot: string) =>
      JSON.stringify(current.current) === snapshot && discard(),
    hasChanges: () => changed(current.current, baselineRef.current),
    persist: () => persist(current.current),
  };
}
