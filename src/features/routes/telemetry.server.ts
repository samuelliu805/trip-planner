import { createClient } from "@/lib/supabase/server";
import type { RouteMode, RouteView } from "@/lib/telemetry/events";
import { reportAuthoritativeMutationOutcome, telemetryOperationId } from "@/lib/telemetry/product";
import {
  captureServerProductEvent,
  serverProductTelemetryEnabled,
} from "@/lib/telemetry/product-server";

export async function reportRouteCalculation<Result extends object>(options: {
  operationId?: unknown;
  result: Result;
  routeMode?: RouteMode;
  routeView: RouteView;
}): Promise<Result> {
  const operationId = telemetryOperationId(options.operationId);
  if (!operationId || !options.routeMode || !serverProductTelemetryEnabled()) return options.result;
  let appUserId: string | undefined;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    appUserId = data.user?.id;
  } catch {
    // Identity lookup cannot replace an authoritative route result.
  }
  const context = {
    actorType: appUserId ? ("authenticated" as const) : ("anonymous" as const),
    route: "/trips/[tripId]",
    appUserId,
  };
  const properties = {
    operation_id: operationId,
    route_mode: options.routeMode,
    route_view: options.routeView,
    surface: "route_panel" as const,
  };
  return reportAuthoritativeMutationOutcome(options.result, {
    failed: (errorCode) =>
      captureServerProductEvent(
        "route_calculation_failed",
        { ...properties, error_code: errorCode },
        context,
      ),
    succeeded: () => captureServerProductEvent("route_calculated", properties, context),
  });
}

export async function reportRouteCalculationFailure(options: {
  error: string;
  operationId?: unknown;
  routeMode?: RouteMode;
  routeView: RouteView;
}): Promise<void> {
  await reportRouteCalculation({
    operationId: options.operationId,
    result: { error: options.error },
    routeMode: options.routeMode,
    routeView: options.routeView,
  });
}
