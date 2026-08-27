import { PostHog } from "posthog-node";

import type { TelemetryConfig } from "./config";
import type { ServerTelemetryEventName } from "./events";
import { sanitizeProviderEvent, type ProviderCaptureEvent } from "./privacy";

export type PostHogServerAdapter = {
  capture: (
    eventName: ServerTelemetryEventName,
    distinctId: string,
    properties: Record<string, unknown>,
  ) => void;
  captureException: (
    error: Error,
    distinctId: string,
    properties: Record<string, unknown>,
  ) => Promise<void>;
  flush: () => Promise<void>;
};

let singleton: PostHog | null = null;

export function getPostHogServerAdapter(config: TelemetryConfig): PostHogServerAdapter | null {
  if (!config.enabled || !config.host || !config.projectToken) return null;
  singleton ??= new PostHog(config.projectToken, {
    before_send: (event) =>
      sanitizeProviderEvent(event as unknown as ProviderCaptureEvent, config) as typeof event,
    enableExceptionAutocapture: false,
    flushAt: 1,
    flushInterval: 0,
    host: config.host,
    privacyMode: true,
  });
  return {
    capture(eventName, distinctId, properties) {
      singleton?.capture({
        disableGeoip: true,
        distinctId,
        event: eventName,
        properties,
      });
    },
    async captureException(error, distinctId, properties) {
      await singleton?.captureExceptionImmediate(error, distinctId, properties);
    },
    async flush() {
      await singleton?.flush();
    },
  };
}
