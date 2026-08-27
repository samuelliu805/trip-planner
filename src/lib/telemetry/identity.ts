import type { TelemetryEnvironment } from "./config";

export function systemAnalyticsId(environment: TelemetryEnvironment): string {
  return `system:trip-planner-web:${environment}`;
}
