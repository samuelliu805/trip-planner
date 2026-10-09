"use client";
import type { QueryClient } from "@tanstack/react-query";
import { registerAccountQueue } from "../editing/account-runtime";
import { PlannerSyncRuntime } from "./planner-sync-runtime";
import type { PlannerWorkspace } from "./types";

const runtimes = new Map<string, PlannerSyncRuntime>();
export const findPlannerRuntime = (scope: string[]) => runtimes.get(JSON.stringify(scope));
export function ownedPlannerRuntime(
  scope: string[],
  client: QueryClient,
  workspace: PlannerWorkspace,
) {
  const key = JSON.stringify(scope);
  let runtime = runtimes.get(key);
  if (!runtime) {
    runtime = new PlannerSyncRuntime(scope, client, workspace, localStorage);
    runtimes.set(key, runtime);
    const owner = runtime;
    registerAccountQueue(scope[1], (enabled) => {
      if (enabled) {
        owner.reloadCheckpoint();
        owner.queue.reload();
      }
      owner.queue.setEnabled(enabled);
    });
  }
  runtime.attach(client, workspace);
  return runtime;
}
