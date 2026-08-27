import { PostHog } from "posthog-node";

import type { TelemetryConfig } from "./config.ts";
import type { ServerTelemetryEventName } from "./events.ts";
import { sanitizeProviderEvent, type ProviderCaptureEvent } from "./privacy.ts";
import { sanitizeServerExceptionEvent } from "./privacy-server-exceptions.ts";

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

export type PostHogServerClient = Pick<PostHog, "capture" | "captureExceptionImmediate" | "flush">;

let singleton: PostHogServerClient | null = null;

export function createPostHogServerAdapter(client: PostHogServerClient): PostHogServerAdapter {
  return {
    capture(eventName, distinctId, properties) {
      client.capture({
        disableGeoip: true,
        distinctId,
        event: eventName,
        properties,
      });
    },
    async captureException(error, distinctId, properties) {
      await client.captureExceptionImmediate(error, distinctId, properties);
    },
    async flush() {
      await client.flush();
    },
  };
}

export function getPostHogServerAdapter(config: TelemetryConfig): PostHogServerAdapter | null {
  if (!config.enabled || !config.host || !config.projectToken) return null;
  singleton ??= new PostHog(config.projectToken, {
    before_send: (event) => {
      const providerEvent = event as unknown as ProviderCaptureEvent;
      const sanitized =
        providerEvent?.event === "$exception"
          ? sanitizeServerExceptionEvent(providerEvent, config)
          : sanitizeProviderEvent(providerEvent, config);
      return sanitized as typeof event;
    },
    enableExceptionAutocapture: false,
    flushAt: 1,
    flushInterval: 0,
    host: config.host,
    privacyMode: true,
  });
  return createPostHogServerAdapter(singleton);
}
