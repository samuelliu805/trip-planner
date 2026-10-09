"use client";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BackgroundActionOwner } from "./background-action-owner";
import { useDraftScope } from "./draft-scope";
import { setLocalActivity } from "./sync-registry";
const owners = new Map<string, BackgroundActionOwner>();
export function ownedBackgroundActions(scope: string[], client?: QueryClient) {
  const key = JSON.stringify(scope);
  let owner = owners.get(key);
  if (!owner) {
    owner = new BackgroundActionOwner(scope, window.localStorage, client);
    owners.set(key, owner);
  }
  return owner;
}
const noop = () => () => {};
export function useBackgroundActions(tripId: string, domain: string) {
  const client = useQueryClient();
  const scope = useDraftScope(tripId, domain),
    key = JSON.stringify(scope);
  const [current, setCurrent] = useState<{ key: string; owner: BackgroundActionOwner }>();
  useEffect(() => {
    if (scope[1] === "guest") return;
    let mounted = true;
    try {
      const owner = ownedBackgroundActions(JSON.parse(key), client);
      queueMicrotask(() => {
        if (mounted) setCurrent({ key, owner });
      });
    } catch (error) {
      setLocalActivity(`actions:${key}`, { scope, state: "local-failure", error: String(error) });
    }
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client]);
  const owner = current?.key === key ? current.owner : undefined;
  useSyncExternalStore(owner?.subscribe ?? noop, owner?.getRevision ?? (() => 0), () => 0);
  return owner;
}
