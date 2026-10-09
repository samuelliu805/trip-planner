"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDraftScope } from "../editing/draft-scope";
import { registerAccountQueue } from "../editing/account-runtime";
import { ResearchSyncRuntime } from "./research-sync-runtime";
import { setLocalActivity } from "../editing/sync-registry";

const runtimes = new Map<string, ResearchSyncRuntime>();
export function ownedResearchRuntime(scope: string[], client: ReturnType<typeof useQueryClient>) {
  const key = JSON.stringify(scope);
  let runtime = runtimes.get(key);
  if (!runtime) {
    runtime = new ResearchSyncRuntime(scope, client, window.localStorage);
    runtimes.set(key, runtime);
    const owner = runtime;
    registerAccountQueue(scope[1], (enabled) => {
      if (enabled) owner.reload();
      owner.queue.setEnabled(enabled);
    });
  }
  return runtime;
}
export function useResearchSync(tripId: string) {
  const client = useQueryClient(),
    scope = useDraftScope(tripId, "ideas");
  const key = JSON.stringify(scope);
  const [owned, setOwned] = useState<{ key: string; runtime: ResearchSyncRuntime }>();
  useEffect(() => {
    if (scope[1] === "guest") return;
    let mounted = true;
    let runtime: ResearchSyncRuntime;
    try {
      runtime = ownedResearchRuntime(JSON.parse(key), client);
      Promise.resolve().then(() => {
        if (mounted) setOwned({ key, runtime: runtime! });
      });
      setLocalActivity(`ideas-runtime:${key}`);
    } catch (error) {
      setLocalActivity(`ideas-runtime:${key}`, {
        scope,
        state: "local-failure",
        error: error instanceof Error ? error.message : "Ideas recovery failed.",
      });
      return;
    }
    const resume = () => runtime!.reload();
    const changed = (event: StorageEvent) => {
      if (event.key?.includes(key)) resume();
    };
    window.addEventListener("online", resume);
    window.addEventListener("storage", changed);
    return () => {
      mounted = false;
      window.removeEventListener("online", resume);
      window.removeEventListener("storage", changed);
    };
    // Scope is captured as a stable serialized tuple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);
  return owned?.key === key ? owned.runtime : undefined;
}
