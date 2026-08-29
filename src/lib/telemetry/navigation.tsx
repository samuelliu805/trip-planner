"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";

import { analytics, analyticsBoundaryForRoute, initializeBrowserTelemetry } from "./client";
import { browserTelemetryConfig } from "./config";
import type { WebVitalName, WebVitalRating } from "./events";
import { createAnonymousIdentityResetTracker } from "./identity-boundary";
import { ideasCategoryForPath, normalizeTelemetryRoute, telemetryScreenForRoute } from "./routes";

let lastPageviewPathname: string | null = null;
const shouldResetAnonymousIdentity = createAnonymousIdentityResetTracker();
const reportedWebVitals = new Set<string>();

export function TelemetryNavigation() {
  const pathname = usePathname();

  useEffect(() => {
    if (!browserTelemetryConfig.enabled || !browserTelemetryConfig.region || !pathname) return;
    const route = normalizeTelemetryRoute(pathname);
    initializeBrowserTelemetry(browserTelemetryConfig, pathname);
    if (shouldResetAnonymousIdentity(route)) analytics.reset();
    if (lastPageviewPathname === pathname) return;
    lastPageviewPathname = pathname;
    analyticsBoundaryForRoute(route).capture("$pageview", {
      $current_url: window.location.href,
      $pathname: pathname,
      $referrer: document.referrer,
      environment: browserTelemetryConfig.environment,
      ...(ideasCategoryForPath(pathname) ? { ideas_category: ideasCategoryForPath(pathname) } : {}),
      screen: telemetryScreenForRoute(route),
      telemetry_region: browserTelemetryConfig.region,
    });
  }, [pathname]);

  useReportWebVitals((metric) => {
    if (!browserTelemetryConfig.enabled || !browserTelemetryConfig.region) return;
    if (!(["CLS", "FCP", "INP", "LCP", "TTFB"] as string[]).includes(metric.name)) return;
    const key = `${metric.name}:${metric.id}:${window.location.pathname}`;
    if (reportedWebVitals.has(key)) return;
    if (reportedWebVitals.size > 200) reportedWebVitals.clear();
    reportedWebVitals.add(key);
    const route = normalizeTelemetryRoute(window.location.pathname);
    initializeBrowserTelemetry(browserTelemetryConfig, window.location.pathname);
    analyticsBoundaryForRoute(route).capture("$web_vitals", {
      $current_url: window.location.href,
      $pathname: window.location.pathname,
      environment: browserTelemetryConfig.environment,
      metric_delta: metric.delta,
      metric_name: metric.name as WebVitalName,
      metric_rating: metric.rating as WebVitalRating,
      metric_value: metric.value,
      screen: telemetryScreenForRoute(route),
      telemetry_region: browserTelemetryConfig.region,
    });
  });

  return null;
}
