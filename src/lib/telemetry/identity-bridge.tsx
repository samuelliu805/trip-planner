"use client";

import { useEffect } from "react";

import type { Locale } from "@/features/i18n/config";

import { analytics } from "./client";
import { browserTelemetryConfig } from "./config";

export function TelemetryIdentityBridge({
  analyticsId,
  locale,
}: {
  analyticsId: string;
  locale: Locale;
}) {
  useEffect(() => {
    if (!browserTelemetryConfig.enabled || !browserTelemetryConfig.region) return;
    analytics.identify(analyticsId, {
      account_state: "authenticated",
      environment: browserTelemetryConfig.environment,
      locale,
      telemetry_region: browserTelemetryConfig.region,
    });
  }, [analyticsId, locale]);

  return null;
}
