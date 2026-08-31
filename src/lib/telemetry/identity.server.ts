import { createHmac } from "node:crypto";

import { resolveServerTelemetryConfig, type TelemetryEnvironment } from "./config.ts";

const appUserIdPattern = /^(?=[^\u0000-\u001f\u007f]{1,128}$)(?=.*(?:\d|:)).+$/;

export function createPseudonymousAnalyticsId(
  appUserId: string,
  hmacSecret: string,
  environment: TelemetryEnvironment,
): string | null {
  if (!appUserIdPattern.test(appUserId) || hmacSecret.length < 32) return null;
  const digest = createHmac("sha256", hmacSecret)
    .update(`trip-planner-web:${environment}:${appUserId}`, "utf8")
    .digest("hex");
  return `tpv1_${digest}`;
}

export function authenticatedAnalyticsId(appUserId: string): string | null {
  const config = resolveServerTelemetryConfig();
  const secret = process.env.TELEMETRY_ID_HMAC_SECRET;
  if (!config.enabled || !secret) return null;
  return createPseudonymousAnalyticsId(appUserId, secret, config.environment);
}
