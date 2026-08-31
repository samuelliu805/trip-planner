import { createClient } from "@/lib/supabase/server";
import type { VariantAction } from "@/lib/telemetry/events";
import { reportAuthoritativeMutationOutcome, telemetryOperationId } from "@/lib/telemetry/product";
import {
  captureServerProductEvent,
  serverProductTelemetryEnabled,
} from "@/lib/telemetry/product-server";

type VariantMutation = "create" | "update" | "delete" | "primary";
const names = {
  create: { failed: "variant_create_failed", succeeded: "variant_created" },
  update: { failed: "variant_update_failed", succeeded: "variant_updated" },
  delete: { failed: "variant_delete_failed", succeeded: "variant_deleted" },
  primary: { failed: "variant_primary_set_failed", succeeded: "variant_primary_set" },
} as const;

export async function reportVariantMutation<Result extends object>(options: {
  action?: VariantAction;
  mutation: VariantMutation;
  operationId?: unknown;
  result: Result;
}): Promise<Result> {
  const operationId = telemetryOperationId(options.operationId);
  if (!operationId || !serverProductTelemetryEnabled()) return options.result;
  let appUserId: string | undefined;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    appUserId = data.user?.id;
  } catch {
    // Identity lookup cannot replace an authoritative variant result.
  }
  const context = {
    actorType: appUserId ? ("authenticated" as const) : ("anonymous" as const),
    route: "/trips/[tripId]",
    appUserId,
  };
  const properties = { operation_id: operationId, surface: "variant_controls" as const };
  if (options.mutation === "create") {
    const action = options.action ?? "blank";
    return reportAuthoritativeMutationOutcome(options.result, {
      failed: (errorCode) =>
        captureServerProductEvent(
          "variant_create_failed",
          { ...properties, error_code: errorCode, variant_action: action },
          context,
        ),
      succeeded: () =>
        captureServerProductEvent(
          "variant_created",
          { ...properties, variant_action: action },
          context,
        ),
    });
  }
  const eventNames = names[options.mutation];
  return reportAuthoritativeMutationOutcome(options.result, {
    failed: (errorCode) =>
      captureServerProductEvent(
        eventNames.failed,
        { ...properties, error_code: errorCode },
        context,
      ),
    succeeded: () => captureServerProductEvent(eventNames.succeeded, properties, context),
  });
}
