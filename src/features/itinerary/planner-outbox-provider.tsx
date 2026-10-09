"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDraftScope } from "../editing/draft-scope";
import { PlannerSyncRuntime } from "./planner-sync-runtime";
import type { PlannerWorkspace } from "./types";
import { ownedPlannerRuntime } from "./planner-runtime-owner";
import { setLocalActivity } from "../editing/sync-registry";

const OutboxContext = createContext<PlannerSyncRuntime | null>(null);

export function PlannerOutboxProvider({
  children,
  workspace,
}: {
  children: ReactNode;
  workspace: PlannerWorkspace;
}) {
  const client = useQueryClient();
  const scope = useDraftScope(workspace.variant.trip_id, workspace.variant.id);
  const key = JSON.stringify(scope);
  const [owned, setOwned] = useState<{ key: string; runtime: PlannerSyncRuntime } | null>(null);
  useEffect(() => {
    if (scope[1] === "guest") return;
    let next: PlannerSyncRuntime;
    try {
      next = ownedPlannerRuntime(scope, client, workspace);
      setLocalActivity(`planner-runtime:${key}`);
    } catch (error) {
      setLocalActivity(`planner-runtime:${key}`, {
        scope,
        state: "local-failure",
        error: String(error),
      });
      return;
    }
    next.queue.setEnabled(true);
    // This initialization is deferred until browser storage exists; never expose another account's runtime.
    let mounted = true;
    Promise.resolve().then(() => {
      if (mounted) setOwned({ key, runtime: next });
    });
    const online = () => {
      void next.queue.pump();
    };
    const changed = (event: StorageEvent) => {
      if (
        !event.key?.startsWith(`${next.queue.prefix}:`) &&
        !event.key?.startsWith(`${next.queue.prefix}-receipt:`) &&
        !event.key?.startsWith("trip-planner:sync-baseline:v1:")
      )
        return;
      next.reloadCheckpoint();
      next.queue.reload();
      void next.queue.pump();
    };
    window.addEventListener("online", online);
    window.addEventListener("storage", changed);
    return () => {
      mounted = false;
      window.removeEventListener("online", online);
      window.removeEventListener("storage", changed);
    };
    // Account/variant identity fixes the runtime lifetime; later reads enter through reconcile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, client]);
  return (
    <OutboxContext.Provider value={owned?.key === key ? owned.runtime : null}>
      {children}
    </OutboxContext.Provider>
  );
}

export function usePlannerOutbox() {
  return useContext(OutboxContext);
}
