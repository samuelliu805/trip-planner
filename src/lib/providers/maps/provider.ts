import {
  mapsProviders,
  type MapsProviderId as DeploymentMapsProviderId,
} from "../../../platform/config/provider-matrix.ts";

export const mapsProviderIds = mapsProviders;
export type MapsProviderId = DeploymentMapsProviderId;
export type MapsProviderCapability = "maps" | "photos" | "places" | "routes";
export type MapsProviderConfigurationErrorCode = "invalid_provider" | "provider_unavailable";

const providerLabel = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : "unknown";

export class MapsProviderConfigurationError extends Error {
  readonly capability: MapsProviderCapability;
  readonly code: MapsProviderConfigurationErrorCode;
  readonly providerId?: MapsProviderId;

  constructor(options: {
    capability: MapsProviderCapability;
    code: MapsProviderConfigurationErrorCode;
    providerId?: MapsProviderId;
    value?: unknown;
  }) {
    const message =
      options.code === "invalid_provider"
        ? `The configured maps provider “${providerLabel(options.value)}” is invalid.`
        : `The configured maps provider “${options.providerId}” is not available for ${options.capability} yet.`;
    super(message);
    this.capability = options.capability;
    this.code = options.code;
    this.name = "MapsProviderConfigurationError";
    this.providerId = options.providerId;
  }
}

export function parseMapsProviderId(value: unknown): MapsProviderId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return mapsProviderIds.includes(normalized as MapsProviderId)
    ? (normalized as MapsProviderId)
    : null;
}

/** Missing configuration deliberately preserves the current global Google behavior. */
export function configuredMapsProviderId(
  value: string | undefined = process.env.NEXT_PUBLIC_MAPS_PROVIDER,
): MapsProviderId {
  if (value === undefined || value.trim() === "") return "google";
  const providerId = parseMapsProviderId(value);
  if (!providerId)
    throw new MapsProviderConfigurationError({
      capability: "maps",
      code: "invalid_provider",
      value,
    });
  return providerId;
}

export function resolveMapsProvider(
  capability: MapsProviderCapability,
  value: string | undefined = process.env.NEXT_PUBLIC_MAPS_PROVIDER,
): MapsProviderId {
  let providerId: MapsProviderId;
  try {
    providerId = configuredMapsProviderId(value);
  } catch (error) {
    if (error instanceof MapsProviderConfigurationError)
      throw new MapsProviderConfigurationError({
        capability,
        code: error.code,
        value,
      });
    throw error;
  }
  if (providerId === "amap" && capability === "photos")
    throw new MapsProviderConfigurationError({
      capability,
      code: "provider_unavailable",
      providerId,
    });
  return providerId;
}
