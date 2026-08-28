import { createClient } from "@/lib/supabase/server";
import {
  itemKindForTelemetry,
  reportAuthoritativeMutationOutcome,
  telemetryOperationId,
  telemetrySurface,
} from "@/lib/telemetry/product";
import {
  captureServerProductEvent,
  serverProductTelemetryEnabled,
} from "@/lib/telemetry/product-server";

type ItemMutationKind = "create" | "delete" | "update";

const eventNames = {
  create: { failed: "item_create_failed", succeeded: "item_created" },
  delete: { failed: "item_delete_failed", succeeded: "item_deleted" },
  update: { failed: "item_update_failed", succeeded: "item_updated" },
} as const;

export async function reportItemMutation<Result extends { error?: string }>(options: {
  itemType: unknown;
  mutation: ItemMutationKind;
  operationId?: unknown;
  result: Result;
  surface?: unknown;
}): Promise<Result> {
  return reportItemMutations({ ...options, itemTypes: [options.itemType] });
}

export async function reportItemMutations<Result extends { error?: string }>(options: {
  itemTypes: unknown[];
  mutation: ItemMutationKind;
  operationId?: unknown;
  result: Result;
  surface?: unknown;
}): Promise<Result> {
  const itemKinds = [
    ...new Set(options.itemTypes.map(itemKindForTelemetry).filter((kind) => kind !== undefined)),
  ];
  if (!itemKinds.length || !serverProductTelemetryEnabled()) return options.result;
  let supabaseUserId: string | undefined;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    supabaseUserId = data.user?.id;
  } catch {
    // An analytics identity lookup must not replace the mutation result.
  }
  const operationId = telemetryOperationId(options.operationId);
  const surface = telemetrySurface(options.surface) ?? "planner";
  const names = eventNames[options.mutation];
  for (const itemKind of itemKinds) {
    await reportAuthoritativeMutationOutcome(options.result, {
      failed: (errorCode) =>
        captureServerProductEvent(
          names.failed,
          { error_code: errorCode, item_kind: itemKind, operation_id: operationId, surface },
          {
            actorType: supabaseUserId ? "authenticated" : "anonymous",
            route: "/trips/[tripId]",
            supabaseUserId,
          },
        ),
      succeeded: () =>
        captureServerProductEvent(
          names.succeeded,
          { item_kind: itemKind, operation_id: operationId, surface },
          {
            actorType: supabaseUserId ? "authenticated" : "anonymous",
            route: "/trips/[tripId]",
            supabaseUserId,
          },
        ),
    });
  }
  return options.result;
}
