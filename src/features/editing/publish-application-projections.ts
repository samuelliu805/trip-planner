import type { QueryClient } from "@tanstack/react-query";
import type { OutboxOperation } from "./outbox";
import { backgroundActionSchema } from "./background-action-intent";
import { findPlannerRuntime } from "../itinerary/planner-runtime-owner";
import { plannerQueryKey } from "../itinerary/planner-query";
import { projectApplication } from "../research/application-projection";
import { reboundApplicationProjection } from "../research/application-receipt";
import { bindApplicationProjectionParents } from "../research/application-projection-parents";

export function publishApplicationProjections(
  operations: OutboxOperation[],
  scope: string[],
  storage: Storage,
  client?: QueryClient,
) {
  for (const op of operations) {
    const intent = backgroundActionSchema.parse(op.intent);
    if (
      (intent.kind === "idea.apply" || intent.kind === "booking.apply") &&
      intent.projection &&
      client
    ) {
      const variantScope = [...scope.slice(0, 3), intent.input.variantId];
      const runtime = findPlannerRuntime(variantScope);
      if (runtime) runtime.publish();
      else if (op.status !== "acknowledged") {
        const key = plannerQueryKey(scope[2], intent.input.variantId);
        client.setQueryData(
          key,
          (workspace: import("../itinerary/types").PlannerWorkspace | undefined) =>
            workspace
              ? projectApplication(
                  workspace,
                  reboundApplicationProjection(
                    storage,
                    scope,
                    op.id,
                    bindApplicationProjectionParents(
                      intent.projection!,
                      intent.applicationParents ?? op.dependsOn,
                      scope,
                      storage,
                    ),
                  ),
                )
              : workspace,
        );
      }
    }
  }
}
