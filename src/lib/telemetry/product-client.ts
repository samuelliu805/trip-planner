"use client";

import { analyticsBoundaryForRoute } from "./client.ts";
import { browserTelemetryConfig, type TelemetryConfig } from "./config.ts";
import { featureAreaForProductEvent } from "./events.ts";
import type {
  BrowserProductEventName,
  ProductContext,
  TelemetryActorType,
  TelemetryEventProperties,
} from "./events.ts";
import { normalizeTelemetryRoute, telemetryScreenForRoute } from "./routes.ts";
import { telemetryInsertId } from "./product.ts";

type BrowserProductPayload<EventName extends BrowserProductEventName> = Omit<
  TelemetryEventProperties[EventName],
  keyof ProductContext
>;

type BrowserProductCapture = (
  eventName: BrowserProductEventName,
  properties: TelemetryEventProperties[BrowserProductEventName],
) => void;

export function captureBrowserProductEvent<EventName extends BrowserProductEventName>(
  eventName: EventName,
  properties: BrowserProductPayload<EventName>,
  options: {
    actorType: TelemetryActorType;
    capture?: BrowserProductCapture;
    config?: TelemetryConfig;
    pathname?: string;
  },
): boolean {
  const config = options.config ?? browserTelemetryConfig;
  if (!config.enabled || !config.region) return false;
  const pathname =
    options.pathname ?? (typeof window === "undefined" ? undefined : window.location.pathname);
  if (!pathname) return false;
  const route = normalizeTelemetryRoute(pathname);
  const insertId = telemetryInsertId(
    eventName,
    (properties as { operation_id?: unknown }).operation_id,
    undefined,
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
    route,
    screen: telemetryScreenForRoute(route),
    telemetry_region: config.region,
  } as TelemetryEventProperties[EventName];
  try {
    if (options.capture) {
      options.capture(eventName, eventProperties);
    } else {
      analyticsBoundaryForRoute(route).capture(eventName, eventProperties);
    }
    return true;
  } catch {
    return false;
  }
}
