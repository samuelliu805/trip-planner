import { createHmac } from "node:crypto";

import { resolveServerTelemetryConfig, type TelemetryEnvironment } from "./config.ts";

const supabaseUserIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createPseudonymousAnalyticsId(
  supabaseUserId: string,
  hmacSecret: string,
  environment: TelemetryEnvironment,
): string | null {
  if (!supabaseUserIdPattern.test(supabaseUserId) || hmacSecret.length < 32) return null;
  const digest = createHmac("sha256", hmacSecret)
    .update(`trip-planner-web:${environment}:${supabaseUserId}`, "utf8")
    .digest("hex");
  return `tpv1_${digest}`;
}

export function authenticatedAnalyticsId(supabaseUserId: string): string | null {
  const config = resolveServerTelemetryConfig();
  const secret = process.env.TELEMETRY_ID_HMAC_SECRET;
  if (!config.enabled || !secret) return null;
  return createPseudonymousAnalyticsId(supabaseUserId, secret, config.environment);
}
