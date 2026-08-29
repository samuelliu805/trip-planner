import { resolveServerTelemetryConfig } from "./config.ts";
import { telemetryRelease } from "./context.ts";
import { featureAreaForProductEvent } from "./events.ts";
import type {
  ProductContext,
  ServerProductEventName,
  TelemetryActorType,
  TelemetryEventProperties,
} from "./events.ts";
import { authenticatedAnalyticsId } from "./identity.server.ts";
import { normalizeTelemetryRoute, telemetryScreenForRoute } from "./routes.ts";
import { serverAnalytics } from "./server.ts";
import { telemetryInsertId } from "./product.ts";

type ServerProductPayload<EventName extends ServerProductEventName> = Omit<
  TelemetryEventProperties[EventName],
  keyof ProductContext
>;

export function serverProductTelemetryEnabled(): boolean {
  const config = resolveServerTelemetryConfig();
  return Boolean(config.enabled && config.region);
}

export async function captureServerProductEvent<EventName extends ServerProductEventName>(
  eventName: EventName,
  properties: ServerProductPayload<EventName>,
  options: {
    actorType: TelemetryActorType;
    route: string;
    supabaseUserId?: string;
  },
): Promise<void> {
  try {
    const config = resolveServerTelemetryConfig();
    if (!config.enabled || !config.region) return;
    const route = normalizeTelemetryRoute(options.route);
    const analyticsId = options.supabaseUserId
      ? (authenticatedAnalyticsId(options.supabaseUserId) ?? undefined)
      : undefined;
    const insertId = telemetryInsertId(
      eventName,
      (properties as { operation_id?: unknown }).operation_id,
      (properties as { outcome?: unknown }).outcome,
      (properties as { item_kind?: unknown }).item_kind,
      (properties as { auth_flow?: unknown }).auth_flow,
    );
    const eventProperties = {
      ...properties,
      ...(insertId ? { $insert_id: insertId } : {}),
      ...(featureAreaForProductEvent(eventName)
        ? { feature_area: featureAreaForProductEvent(eventName) }
        : {}),
      actor_type: options.actorType,
      environment: config.environment,
      ...(telemetryRelease() ? { release: telemetryRelease() } : {}),
      route,
      screen: telemetryScreenForRoute(route),
      telemetry_region: config.region,
    } as TelemetryEventProperties[EventName];
    await serverAnalytics.capture(eventName, eventProperties, { analyticsId });
  } catch {
    // Product work and navigation never depend on telemetry delivery.
  }
}
