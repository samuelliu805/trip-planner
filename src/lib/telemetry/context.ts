import type { TelemetryConfig } from "./config.ts";

const releasePattern = /^[0-9a-f]{7,64}$/i;

export function telemetryRelease(
  env: Partial<Record<"VERCEL_GIT_COMMIT_SHA", string>> = process.env as Partial<
    Record<"VERCEL_GIT_COMMIT_SHA", string>
  >,
) {
  const release = env.VERCEL_GIT_COMMIT_SHA;
  return release && releasePattern.test(release) ? release : undefined;
}

export function isNodeTelemetryRuntime(
  env: Partial<Record<"NEXT_RUNTIME", string>> = process.env as Partial<
    Record<"NEXT_RUNTIME", string>
  >,
): boolean {
  return env.NEXT_RUNTIME !== "edge";
}

export function serverTelemetryContext(config: TelemetryConfig) {
  return {
    environment: config.environment,
    region: "global" as const,
    ...(telemetryRelease() ? { release: telemetryRelease() } : {}),
    runtime: "nodejs" as const,
  };
}
