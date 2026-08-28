import posthog from "posthog-js";

import { browserTelemetryConfig } from "./config.ts";
import type {
  BrowserTelemetryEventName,
  PersonProperties,
  TelemetryEventProperties,
} from "./events.ts";
import { sanitizeProviderEvent, type ProviderCaptureEvent } from "./privacy.ts";

export type BrowserTelemetryAdapter = {
  capture: (eventName: string, properties: Record<string, unknown>) => void;
  currentIdentifiedId: () => string | undefined;
  identify: (analyticsId: string, properties: PersonProperties) => void;
  reset: () => void;
};

export function createAnalyticsBoundary(enabled: boolean, adapter?: BrowserTelemetryAdapter) {
  let activeAdapter = adapter;
  let active = enabled;
  let identifiedId: string | null = null;

  return {
    capture<EventName extends BrowserTelemetryEventName>(
      eventName: EventName,
      properties: TelemetryEventProperties[EventName],
    ) {
      if (!active || !activeAdapter) return;
      try {
        activeAdapter.capture(eventName, properties);
      } catch {
        // Telemetry is never allowed to affect rendering or navigation.
      }
    },
    configure(nextEnabled: boolean, nextAdapter?: BrowserTelemetryAdapter) {
      active = nextEnabled;
      activeAdapter = nextAdapter;
    },
    identify(analyticsId: string, properties: PersonProperties) {
      if (!active || !activeAdapter || !/^tpv1_[0-9a-f]{64}$/.test(analyticsId)) return;
      try {
        const persistedId = activeAdapter.currentIdentifiedId();
        if (persistedId === analyticsId || identifiedId === analyticsId) {
          identifiedId = analyticsId;
          return;
        }
        if (persistedId || identifiedId) activeAdapter.reset();
        activeAdapter.identify(analyticsId, properties);
        identifiedId = analyticsId;
      } catch {
        // Authentication must continue even when identity reporting fails.
      }
    },
    reset() {
      if (!active || !activeAdapter) return;
      try {
        activeAdapter.reset();
      } catch {
        // Sign-out and anonymous routes must not depend on telemetry availability.
      } finally {
        identifiedId = null;
      }
    },
  };
}

export const analytics = createAnalyticsBoundary(false);
let initialized = false;

function postHogAdapter(): BrowserTelemetryAdapter {
  return {
    capture(eventName, properties) {
      posthog.capture(eventName, properties);
    },
    currentIdentifiedId() {
      const value = posthog.get_property("$user_id");
      return typeof value === "string" && /^tpv1_[0-9a-f]{64}$/.test(value) ? value : undefined;
    },
    identify(analyticsId, properties) {
      posthog.identify(analyticsId, properties);
    },
    reset() {
      posthog.reset();
    },
  };
}

export function initializeBrowserTelemetry(config = browserTelemetryConfig): void {
  if (initialized || !config.enabled || !config.host || !config.projectToken || !config.region)
    return;
  if (typeof window === "undefined") return;
  try {
    posthog.init(config.projectToken, {
      advanced_disable_decide: true,
      advanced_disable_feature_flags: true,
      advanced_disable_feature_flags_on_first_load: true,
      api_host: config.host,
      autocapture: false,
      before_send: (event) =>
        sanitizeProviderEvent(event as unknown as ProviderCaptureEvent, config) as typeof event,
      capture_dead_clicks: false,
      capture_exceptions: {
        capture_console_errors: false,
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
      },
      capture_heatmaps: false,
      capture_pageleave: false,
      capture_pageview: false,
      capture_performance: false,
      cross_subdomain_cookie: false,
      debug: false,
      defaults: "2026-05-30",
      disable_capture_url_hashes: true,
      disable_conversations: true,
      disable_product_tours: true,
      disable_session_recording: true,
      disable_surveys: true,
      enable_recording_console_log: false,
      internal_or_test_user_hostname: null,
      logs: {
        captureConsoleLogs: false,
        environment: config.environment,
        serviceName: "trip-planner-web",
      },
      person_profiles: "identified_only",
      rageclick: false,
      save_campaign_params: false,
      save_referrer: false,
      ui_host: "https://us.posthog.com",
    });
    analytics.configure(true, postHogAdapter());
    initialized = true;
  } catch {
    analytics.configure(false);
  }
}
