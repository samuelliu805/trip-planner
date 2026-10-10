"use client";
import type { QueryClient } from "@tanstack/react-query";
import type { OwnerAttachment } from "./schema";
import type { PlannerWorkspace } from "../itinerary/types";
import { findPlannerRuntime, ownedPlannerRuntime } from "../itinerary/planner-runtime-owner";
import { ownedResearchRuntime } from "../research/use-research-sync";

export function observeConfirmedAttachments(actorId: string, client: QueryClient) {
  const receive = (event: Event) => {
    const { scope, target, tripId, entityId, attachments, attachmentsVersion } = (
      event as CustomEvent<{
        scope: string[];
        target: string;
        tripId: string;
        entityId: string;
        attachments: OwnerAttachment[];
        attachmentsVersion?: number;
      }>
    ).detail;
    if (scope[1] !== actorId) return;
    if (target === "research")
      ownedResearchRuntime([scope[0], actorId, tripId, "ideas"], client).confirmAttachments(
        entityId,
        attachments,
        attachmentsVersion,
      );
    else
      for (const [, workspace] of client.getQueriesData<PlannerWorkspace>({
        queryKey: ["planner", tripId],
      })) {
        if (workspace?.days.some((day) => day.items.some((item) => item.id === entityId)))
          (
            findPlannerRuntime([scope[0], actorId, tripId, workspace.variant.id]) ??
            ownedPlannerRuntime(
              [scope[0], actorId, tripId, workspace.variant.id],
              client,
              workspace,
            )
          ).confirmAttachments(entityId, attachments, attachmentsVersion);
      }
  };
  window.addEventListener("trip-planner:attachments-updated", receive);
  return () => window.removeEventListener("trip-planner:attachments-updated", receive);
}
