"use client";
import type { QueryClient } from "@tanstack/react-query";
import { ownedPlannerRuntime } from "../itinerary/planner-runtime-owner";
import { ownedResearchRuntime } from "../research/use-research-sync";
import { ownedSettingsRuntime } from "../trips/settings-sync";
import { ownedRouteRuntime } from "../routes/use-route-tasks";
import { ownedVariantRuntime } from "../variants/use-variant-sync";
import { ownedBackgroundActions } from "./use-background-actions";
import type { PlannerWorkspace } from "../itinerary/types";
import type { Trip } from "@/platform/contracts/trips";
import { setLocalActivity } from "./sync-registry";
import { isAccountActive } from "./account-runtime";

/** Recover owners even when refresh opens another Plan, Ideas, or the trip list. */
export function recoverAccountWork(actorId: string, client: QueryClient) {
  if (!isAccountActive(actorId)) return;
  const seen = new Set<string>();
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    const match = key?.match(
      /^trip-planner:(outbox|ideas-outbox|settings-outbox|route-outbox|variants-outbox|actions-outbox):v1:(\[.*\]):[^:]+$/,
    );
    if (!match || seen.has(match[1] + match[2])) continue;
    let scope: string[] = [];
    try {
      scope = JSON.parse(match[2]);
      if (
        scope.length !== 4 ||
        scope[1] !== actorId ||
        scope[0] !== (process.env.NEXT_PUBLIC_APP_REGION ?? "global")
      )
        continue;
      seen.add(match[1] + match[2]);
      const baselinePrefix =
        match[1] === "outbox" ? "sync" : match[1] === "settings-outbox" ? "settings" : null;
      const baseline = baselinePrefix
        ? JSON.parse(
            localStorage.getItem(`trip-planner:${baselinePrefix}-baseline:v1:${match[2]}`) ??
              "null",
          )
        : null;
      const runtime =
        match[1] === "outbox"
          ? ownedPlannerRuntime(scope, client, baseline as PlannerWorkspace)
          : match[1] === "ideas-outbox"
            ? ownedResearchRuntime(scope, client)
            : match[1] === "route-outbox"
              ? ownedRouteRuntime(scope, client)
              : match[1] === "variants-outbox"
                ? ownedVariantRuntime(scope, client)
                : match[1] === "actions-outbox"
                  ? ownedBackgroundActions(scope, client)
                  : ownedSettingsRuntime(scope, client, baseline as Trip);
      runtime.queue.setEnabled(true);
      void runtime.queue.pump();
      setLocalActivity(`recovery:${match[1]}:${match[2]}`);
    } catch (error) {
      if (scope[1] === actorId)
        setLocalActivity(`recovery:${match[1]}:${match[2]}`, {
          scope,
          state: "local-failure",
          error: `Background work could not be recovered: ${String(error)}`,
        });
    }
  }
}
