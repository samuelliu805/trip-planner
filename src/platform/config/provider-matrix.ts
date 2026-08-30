export const appRegions = ["global", "cn"] as const;
export const dataProviders = ["supabase", "cloudbase"] as const;
export const authProviders = ["supabase", "cloudbase"] as const;
export const storageProviders = ["supabase", "cloudbase"] as const;
export const mapsProviders = ["google", "amap"] as const;

export type AppRegion = (typeof appRegions)[number];
export type DataProviderId = (typeof dataProviders)[number];
export type AuthProviderId = (typeof authProviders)[number];
export type StorageProviderId = (typeof storageProviders)[number];
export type MapsProviderId = (typeof mapsProviders)[number];
export type ProviderValidationMode = "development" | "production" | "test";

export type DeploymentProviderConfig = Readonly<{
  appRegion: AppRegion;
  authProvider: AuthProviderId;
  dataProvider: DataProviderId;
  mapsProvider: MapsProviderId;
  storageProvider: StorageProviderId;
}>;

export type ProviderEnvironment = Readonly<
  Partial<
    Record<
      | "APP_REGION"
      | "AUTH_PROVIDER"
      | "DATA_PROVIDER"
      | "NEXT_PUBLIC_MAPS_PROVIDER"
      | "NODE_ENV"
      | "STORAGE_PROVIDER",
      string
    >
  >
>;

export const providerMatrixByRegion = Object.freeze({
  global: Object.freeze({
    appRegion: "global",
    authProvider: "supabase",
    dataProvider: "supabase",
    mapsProvider: "google",
    storageProvider: "supabase",
  }),
  cn: Object.freeze({
    appRegion: "cn",
    authProvider: "cloudbase",
    dataProvider: "cloudbase",
    mapsProvider: "amap",
    storageProvider: "cloudbase",
  }),
}) satisfies Readonly<Record<AppRegion, DeploymentProviderConfig>>;

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderConfigurationError";
  }
}

function normalized(value: string | undefined) {
  const result = value?.trim().toLowerCase();
  return result || undefined;
}

function parseSelection<T extends string>(
  name: string,
  value: string,
  legalValues: readonly T[],
): T {
  if (legalValues.includes(value as T)) return value as T;
  throw new ProviderConfigurationError(
    `${name} must be one of ${legalValues.join(", ")}; received ${JSON.stringify(value)}.`,
  );
}

export function providerValidationMode(value: string | undefined): ProviderValidationMode {
  return value === "development" || value === "test" ? value : "production";
}

function selectionOrDefault<T extends string>(options: {
  defaultValue: T;
  legalValues: readonly T[];
  mode: ProviderValidationMode;
  name: string;
  value: string | undefined;
}) {
  const value = normalized(options.value);
  if (value) return parseSelection(options.name, value, options.legalValues);
  if (options.mode !== "production") return options.defaultValue;
  throw new ProviderConfigurationError(
    `Missing required deployment provider selector: ${options.name}.`,
  );
}

export function resolveDeploymentProviderConfig(
  env: ProviderEnvironment,
  options: { mode?: ProviderValidationMode } = {},
): DeploymentProviderConfig {
  const mode = options.mode ?? providerValidationMode(env.NODE_ENV);
  const appRegion = selectionOrDefault({
    defaultValue: "global",
    legalValues: appRegions,
    mode,
    name: "APP_REGION",
    value: env.APP_REGION,
  });
  const expected = providerMatrixByRegion[appRegion];
  const resolved = Object.freeze({
    appRegion,
    authProvider: selectionOrDefault({
      defaultValue: expected.authProvider,
      legalValues: authProviders,
      mode,
      name: "AUTH_PROVIDER",
      value: env.AUTH_PROVIDER,
    }),
    dataProvider: selectionOrDefault({
      defaultValue: expected.dataProvider,
      legalValues: dataProviders,
      mode,
      name: "DATA_PROVIDER",
      value: env.DATA_PROVIDER,
    }),
    mapsProvider: selectionOrDefault({
      defaultValue: expected.mapsProvider,
      legalValues: mapsProviders,
      mode,
      name: "NEXT_PUBLIC_MAPS_PROVIDER",
      value: env.NEXT_PUBLIC_MAPS_PROVIDER,
    }),
    storageProvider: selectionOrDefault({
      defaultValue: expected.storageProvider,
      legalValues: storageProviders,
      mode,
      name: "STORAGE_PROVIDER",
      value: env.STORAGE_PROVIDER,
    }),
  });

  const mismatches = (
    ["authProvider", "dataProvider", "mapsProvider", "storageProvider"] as const
  ).filter((key) => resolved[key] !== expected[key]);
  if (mismatches.length) {
    const detail = mismatches
      .map((key) => `${key}=${resolved[key]} (expected ${expected[key]})`)
      .join(", ");
    throw new ProviderConfigurationError(
      `Provider configuration for APP_REGION=${appRegion} is not a legal deployment: ${detail}.`,
    );
  }
  return resolved;
}

export function resolvePublicProviderConfig(
  env: Pick<ProviderEnvironment, "NEXT_PUBLIC_MAPS_PROVIDER" | "NODE_ENV">,
  options: { mode?: ProviderValidationMode } = {},
) {
  const mode = options.mode ?? providerValidationMode(env.NODE_ENV);
  return Object.freeze({
    mapsProvider: selectionOrDefault({
      defaultValue: "google",
      legalValues: mapsProviders,
      mode,
      name: "NEXT_PUBLIC_MAPS_PROVIDER",
      value: env.NEXT_PUBLIC_MAPS_PROVIDER,
    }),
  });
}
