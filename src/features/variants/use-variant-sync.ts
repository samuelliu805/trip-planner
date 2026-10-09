"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PlannerVariant } from "../itinerary/types";
import { useDraftScope } from "../editing/draft-scope";
import { setLocalActivity, subscribeSync, syncRevision } from "../editing/sync-registry";
import { VariantSyncRuntime } from "./variant-sync-runtime";
const owners = new Map<string, VariantSyncRuntime>();
export function ownedVariantRuntime(
  scope: string[],
  client: ReturnType<typeof useQueryClient>,
  initial: PlannerVariant[] = [],
) {
  const key = JSON.stringify(scope);
  let owner = owners.get(key);
  if (!owner) {
    owner = new VariantSyncRuntime(scope, client, localStorage, initial);
    owners.set(key, owner);
  }
  return owner;
}
export function useVariantSync(tripId: string, initial: PlannerVariant[] = []) {
  const client = useQueryClient(),
    scope = useDraftScope(tripId, "variants"),
    key = JSON.stringify(scope);
  const [runtime, setRuntime] = useState<VariantSyncRuntime>();
  useSyncExternalStore(subscribeSync, syncRevision, () => 0);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const scope = JSON.parse(key) as string[];
      if (scope[1] === "guest") return;
      try {
        setRuntime(ownedVariantRuntime(scope, client, initial));
        setLocalActivity(`variant-runtime:${key}`);
      } catch (error) {
        setLocalActivity(`variant-runtime:${key}`, {
          scope,
          state: "local-failure",
          error: String(error),
        });
      }
    });
    return () => {
      current = false;
    };
    // Initial data is accepted once; later server reads use the generation guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  return runtime?.scope.every((value, index) => value === scope[index]) ? runtime : undefined;
}
