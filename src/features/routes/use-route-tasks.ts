"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDraftScope } from "../editing/draft-scope";
import { setLocalActivity, subscribeSync, syncRevision } from "../editing/sync-registry";
import { RouteTaskRuntime } from "./route-task-runtime";

const owners = new Map<string, RouteTaskRuntime>();
export function ownedRouteRuntime(scope: string[], client: ReturnType<typeof useQueryClient>) {
  const key = JSON.stringify(scope);
  let owner = owners.get(key);
  if (!owner) {
    owner = new RouteTaskRuntime(scope, client, localStorage);
    owners.set(key, owner);
  }
  return owner;
}
export function useRouteTasks(tripId: string, variantId: string) {
  const client = useQueryClient(),
    scope = useDraftScope(tripId, variantId);
  const key = JSON.stringify(scope);
  const [runtime, setRuntime] = useState<RouteTaskRuntime>();
  useSyncExternalStore(subscribeSync, syncRevision, () => 0);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const ownerScope = JSON.parse(key) as string[];
      if (ownerScope[1] === "guest") return;
      try {
        setRuntime(ownedRouteRuntime(ownerScope, client));
        setLocalActivity(`route-recovery:${key}`);
      } catch (error) {
        setLocalActivity(`route-recovery:${key}`, {
          scope: ownerScope,
          state: "local-failure",
          error: String(error),
        });
      }
    });
    return () => {
      current = false;
    };
  }, [client, key]);
  return runtime?.scope.every((value, index) => value === scope[index]) ? runtime : undefined;
}
