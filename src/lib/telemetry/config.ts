export const telemetryEnvironments = ["production", "preview", "development"] as const;
export const telemetryRegions = ["global", "cn"] as const;

export type TelemetryEnvironment = (typeof telemetryEnvironments)[number];
export type TelemetryRegion = (typeof telemetryRegions)[number];
export type TelemetryProvider = "posthog";

export type TelemetryDisabledReason =
  | "development_disabled"
  | "disabled"
  | "environment_mismatch"
  | "invalid_environment"
  | "invalid_host"
  | "invalid_provider"
  | "invalid_region"
  | "missing_project_token"
  | "unsupported_region";

export type TelemetryConfig = {
  enabled: boolean;
  environment: TelemetryEnvironment;
  host: string | null;
  projectToken: string | null;
  provider: TelemetryProvider | null;
  reason: TelemetryDisabledReason | null;
  region: TelemetryRegion | null;
};

export type TelemetryEnvironmentVariables = Partial<
  Record<
    | "NEXT_PUBLIC_POSTHOG_HOST"
    | "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
    | "NEXT_PUBLIC_TELEMETRY_ENABLED"
    | "NEXT_PUBLIC_TELEMETRY_ENVIRONMENT"
    | "NEXT_PUBLIC_TELEMETRY_PROVIDER"
    | "NEXT_PUBLIC_TELEMETRY_REGION"
    | "VERCEL_ENV",
    string
  >
>;

const globalPostHogIngestionHost = "https://us.i.posthog.com";
const projectTokenPattern = /^phc_[A-Za-z0-9_-]{8,}$/;

export function parseTelemetryEnvironment(value: unknown): TelemetryEnvironment | null {
  return typeof value === "string" && telemetryEnvironments.includes(value as TelemetryEnvironment)
    ? (value as TelemetryEnvironment)
    : null;
}

export function parseTelemetryRegion(value: unknown): TelemetryRegion | null {
  return typeof value === "string" && telemetryRegions.includes(value as TelemetryRegion)
    ? (value as TelemetryRegion)
    : null;
}

function disabledConfig(
  environment: TelemetryEnvironment,
  reason: TelemetryDisabledReason,
  overrides: Partial<TelemetryConfig> = {},
): TelemetryConfig {
  return {
    enabled: false,
    environment,
    host: null,
    projectToken: null,
    provider: null,
    reason,
    region: null,
    ...overrides,
  };
}

export function resolveTelemetryConfig(
  env: TelemetryEnvironmentVariables,
  options: { validateVercelEnvironment?: boolean } = {},
): TelemetryConfig {
  const environment = parseTelemetryEnvironment(env.NEXT_PUBLIC_TELEMETRY_ENVIRONMENT);
  if (!environment) return disabledConfig("development", "invalid_environment");

  if (env.NEXT_PUBLIC_TELEMETRY_ENABLED !== "true") {
    return disabledConfig(environment, "disabled");
  }
  if (environment === "development") {
    return disabledConfig(environment, "development_disabled");
  }
  if (env.NEXT_PUBLIC_TELEMETRY_PROVIDER !== "posthog") {
    return disabledConfig(environment, "invalid_provider");
  }

  const region = parseTelemetryRegion(env.NEXT_PUBLIC_TELEMETRY_REGION);
  if (!region) return disabledConfig(environment, "invalid_region");
  if (region === "cn") {
    return disabledConfig(environment, "unsupported_region", {
      provider: "posthog",
      region,
    });
  }

  if (options.validateVercelEnvironment) {
    const vercelEnvironment = parseTelemetryEnvironment(env.VERCEL_ENV);
    if (!vercelEnvironment || vercelEnvironment !== environment) {
      return disabledConfig(environment, "environment_mismatch", {
        provider: "posthog",
        region,
      });
    }
  }

  const host = env.NEXT_PUBLIC_POSTHOG_HOST?.replace(/\/+$/, "") ?? "";
  if (host !== globalPostHogIngestionHost) {
    return disabledConfig(environment, "invalid_host", { provider: "posthog", region });
  }

  const projectToken = env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN?.trim() ?? "";
  if (!projectTokenPattern.test(projectToken)) {
    return disabledConfig(environment, "missing_project_token", {
      host,
      provider: "posthog",
      region,
    });
  }

  return {
    enabled: true,
    environment,
    host,
    projectToken,
    provider: "posthog",
    reason: null,
    region,
  };
}

export const browserTelemetryConfig = resolveTelemetryConfig({
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
  NEXT_PUBLIC_TELEMETRY_ENABLED: process.env.NEXT_PUBLIC_TELEMETRY_ENABLED,
  NEXT_PUBLIC_TELEMETRY_ENVIRONMENT: process.env.NEXT_PUBLIC_TELEMETRY_ENVIRONMENT,
  NEXT_PUBLIC_TELEMETRY_PROVIDER: process.env.NEXT_PUBLIC_TELEMETRY_PROVIDER,
  NEXT_PUBLIC_TELEMETRY_REGION: process.env.NEXT_PUBLIC_TELEMETRY_REGION,
});

export function resolveServerTelemetryConfig(
  env: TelemetryEnvironmentVariables = process.env as TelemetryEnvironmentVariables,
): TelemetryConfig {
  return resolveTelemetryConfig(env, { validateVercelEnvironment: true });
}
