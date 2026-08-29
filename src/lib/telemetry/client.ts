import posthog, { PostHog, type PostHogConfig } from "posthog-js";

import { browserTelemetryConfig } from "./config.ts";
import type {
  BrowserTelemetryEventName,
  PersonProperties,
  TelemetryEventProperties,
} from "./events.ts";
import { sanitizeProviderEvent, type ProviderCaptureEvent } from "./privacy.ts";
import { isPublicShareTelemetryRoute, normalizeTelemetryRoute } from "./routes.ts";

export type BrowserTelemetryAdapter = {
  capture: (eventName: string, properties: Record<string, unknown>) => void;
  captureException?: (error: unknown, properties: Record<string, unknown>) => void;
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
    captureException(error: unknown, properties: Record<string, unknown>) {
      if (!active || !activeAdapter?.captureException) return;
      try {
        activeAdapter.captureException(error, properties);
      } catch {
        // Exception reporting failures must never affect the application error path.
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
export const publicShareAnalytics = createAnalyticsBoundary(false);
export type AnalyticsBoundary = ReturnType<typeof createAnalyticsBoundary>;
let ownerInitialized = false;
let publicShareInitialized = false;
let publicSharePostHog: PostHog | undefined;

function postHogAdapter(instance: PostHog): BrowserTelemetryAdapter {
  return {
    capture(eventName, properties) {
      instance.capture(eventName, properties);
    },
    captureException(error, properties) {
      instance.captureException(error, properties);
    },
    currentIdentifiedId() {
      const value = instance.get_property("$user_id");
      return typeof value === "string" && /^tpv1_[0-9a-f]{64}$/.test(value) ? value : undefined;
    },
    identify(analyticsId, properties) {
      instance.identify(analyticsId, properties);
    },
    reset() {
      instance.reset();
    },
  };
}

function postHogOptions(
  config: typeof browserTelemetryConfig,
  options: { persistence?: PostHogConfig["persistence"] } = {},
): Partial<PostHogConfig> {
  return {
    advanced_disable_decide: true,
    advanced_disable_feature_flags: true,
    advanced_disable_feature_flags_on_first_load: true,
    api_host: config.host ?? undefined,
    autocapture: false,
    before_send: (event) =>
      sanitizeProviderEvent(event as unknown as ProviderCaptureEvent, config) as typeof event,
    capture_dead_clicks: false,
    // One application-owned listener routes exceptions to the current analytics boundary.
    capture_exceptions: false,
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
    ...(options.persistence ? { persistence: options.persistence } : {}),
    rageclick: false,
    save_campaign_params: false,
    save_referrer: false,
    ui_host: "https://us.posthog.com",
  };
}

function validBrowserConfig(config: typeof browserTelemetryConfig) {
  return Boolean(config.enabled && config.host && config.projectToken && config.region);
}

function initializeOwnerTelemetry(config: typeof browserTelemetryConfig): void {
  if (ownerInitialized) return;
  try {
    posthog.init(config.projectToken!, postHogOptions(config));
    analytics.configure(true, postHogAdapter(posthog));
    ownerInitialized = true;
  } catch {
    analytics.configure(false);
  }
}

function initializePublicShareTelemetry(config: typeof browserTelemetryConfig): void {
  if (publicShareInitialized) return;
  try {
    publicSharePostHog = new PostHog();
    publicSharePostHog.init(
      config.projectToken!,
      postHogOptions(config, { persistence: "memory" }),
    );
    publicShareAnalytics.configure(true, postHogAdapter(publicSharePostHog));
    publicShareInitialized = true;
  } catch {
    publicShareAnalytics.configure(false);
  }
}

export function analyticsBoundaryForRoute(
  route: string,
  ownerBoundary: AnalyticsBoundary = analytics,
  publicBoundary: AnalyticsBoundary = publicShareAnalytics,
): AnalyticsBoundary {
  return isPublicShareTelemetryRoute(route) ? publicBoundary : ownerBoundary;
}

export function initializeTelemetryInstanceForRoute(
  route: string,
  initializers: { owner: () => void; publicShare: () => void },
): void {
  if (isPublicShareTelemetryRoute(route)) initializers.publicShare();
  else initializers.owner();
}

export function initializeBrowserTelemetry(
  config = browserTelemetryConfig,
  pathname = typeof window === "undefined" ? undefined : window.location.pathname,
): void {
  if (typeof window === "undefined" || !pathname || !validBrowserConfig(config)) return;
  const route = normalizeTelemetryRoute(pathname);
  initializeTelemetryInstanceForRoute(route, {
    owner: () => initializeOwnerTelemetry(config),
    publicShare: () => initializePublicShareTelemetry(config),
  });
}
