"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useDraftScope } from "../editing/draft-scope";
import { isAccountActive } from "../editing/account-runtime";
import { ownedPlaceResolution, type PlaceResolutionOwner } from "./place-resolution-owner";
import type { PlaceSnapshot } from "../../lib/providers/places/types";

const emptySubscribe = () => () => {};
const emptySnapshot = () => null;
export function usePlaceResolution({
  fieldKey,
  query,
  value,
  onResolved,
}: {
  fieldKey: string;
  query: string;
  value: PlaceSnapshot | null;
  onResolved: (place: PlaceSnapshot) => void;
}) {
  const scope = useDraftScope("", "places");
  const actorId = scope[1];
  const scopeKey = JSON.stringify(scope);
  const [owner, setOwner] = useState<PlaceResolutionOwner>();
  const [error, setError] = useState<string>();
  const latest = useRef({ query, value, onResolved });
  useEffect(() => {
    latest.current = { query, value, onResolved };
  });
  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      try {
        const current = ownedPlaceResolution(fieldKey, JSON.parse(scopeKey));
        current.reload();
        setOwner(current);
      } catch (error) {
        setError(String(error));
      }
    });
    return () => {
      mounted = false;
    };
  }, [fieldKey, scopeKey]);
  const task = useSyncExternalStore(
    owner?.subscribe ?? emptySubscribe,
    owner?.snapshot ?? emptySnapshot,
    emptySnapshot,
  );
  useEffect(() => {
    if (!owner) return;
    const reload = () => {
      try {
        owner.reload();
      } catch (error) {
        setError(String(error));
      }
    };
    window.addEventListener("storage", reload);
    return () => window.removeEventListener("storage", reload);
  }, [owner]);
  useEffect(() => {
    if (
      task?.state === "ready" &&
      task.result &&
      isAccountActive(actorId) &&
      latest.current.query === task.query &&
      JSON.stringify(latest.current.value) === task.before
    )
      latest.current.onResolved(task.result);
  }, [task, actorId]);
  return {
    resolving: task?.state === "working",
    error: error ?? (task?.state !== "cancelled" ? task?.error : undefined),
    start: (resolve: () => Promise<PlaceSnapshot>) => {
      if (!owner || error) throw new Error(error ?? "The place could not be selected.");
      owner.start(query, value, resolve);
    },
    invalidate: () => {
      try {
        owner?.invalidate();
      } catch (error) {
        setError(String(error));
      }
    },
  };
}
