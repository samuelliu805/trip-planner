import type { PersonProperties } from "./events.ts";

export function sanitizePersonProperties(value: unknown): PersonProperties | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const properties = value as Record<string, unknown>;
  const locale = properties.locale;
  const environment = properties.environment;
  const region = properties.telemetry_region;
  if (
    properties.account_state !== "authenticated" ||
    (locale !== "en" && locale !== "zh-CN") ||
    (environment !== "production" && environment !== "preview" && environment !== "development") ||
    (region !== "global" && region !== "cn")
  ) {
    return undefined;
  }
  return {
    account_state: "authenticated",
    ...(properties.app_role === "member" ? { app_role: "member" as const } : {}),
    environment,
    locale,
    telemetry_region: region,
  };
}
