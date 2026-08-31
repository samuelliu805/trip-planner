import { getAuthProvider } from "@/platform/composition/server";
import type {
  IdeasCategory,
  ServerProductEventName,
  TelemetryErrorCode,
} from "@/lib/telemetry/events";
import { reportAuthoritativeMutationOutcome, telemetryOperationId } from "@/lib/telemetry/product";
import {
  captureServerProductEvent,
  serverProductTelemetryEnabled,
} from "@/lib/telemetry/product-server";

type ResearchMutation = "create" | "update" | "delete" | "apply" | "revert";

const eventNames = {
  create: { failed: "research_create_failed", succeeded: "research_created" },
  update: { failed: "research_update_failed", succeeded: "research_updated" },
  delete: { failed: "research_delete_failed", succeeded: "research_deleted" },
  apply: { failed: "research_apply_failed", succeeded: "research_applied" },
  revert: { failed: "research_revert_failed", succeeded: "research_reverted" },
} as const satisfies Record<
  ResearchMutation,
  { failed: ServerProductEventName; succeeded: ServerProductEventName }
>;

export async function reportResearchMutation<Result extends object>(options: {
  category: IdeasCategory;
  failureCode?: TelemetryErrorCode;
  mutation: ResearchMutation;
  operationId?: unknown;
  result: Result;
}): Promise<Result> {
  const operationId = telemetryOperationId(options.operationId);
  if (!operationId || !serverProductTelemetryEnabled()) return options.result;
  let appUserId: string | undefined;
  try {
    appUserId = (await getAuthProvider().getCurrentUser())?.id;
  } catch {
    // Identity lookup cannot replace an authoritative mutation result.
  }
  const names = eventNames[options.mutation];
  return reportAuthoritativeMutationOutcome(options.result, {
    failed: (errorCode) =>
      captureServerProductEvent(
        names.failed,
        {
          error_code: options.failureCode ?? errorCode,
          ideas_category: options.category,
          operation_id: operationId,
          surface: "research_editor",
        },
        {
          actorType: appUserId ? "authenticated" : "anonymous",
          route: "/trips/[tripId]/ideas/[category]",
          appUserId,
        },
      ),
    succeeded: () =>
      captureServerProductEvent(
        names.succeeded,
        {
          ideas_category: options.category,
          operation_id: operationId,
          surface: "research_editor",
        },
        {
          actorType: appUserId ? "authenticated" : "anonymous",
          route: "/trips/[tripId]/ideas/[category]",
          appUserId,
        },
      ),
  });
}
