import "server-only";

import { PlatformOperationError } from "../contracts/errors.ts";

function required(name: string, value: string | undefined) {
  if (value?.trim()) return value.trim();
  throw new PlatformOperationError(
    "provider_unavailable",
    `Missing required CloudBase configuration: ${name}.`,
  );
}

export function getCloudBaseConfig() {
  return Object.freeze({
    env: required("CLOUDBASE_ENV_ID", process.env.CLOUDBASE_ENV_ID),
    publishableKey: required("CLOUDBASE_PUBLISHABLE_KEY", process.env.CLOUDBASE_PUBLISHABLE_KEY),
    region: required("CLOUDBASE_REGION", process.env.CLOUDBASE_REGION),
  });
}

export function getCloudBaseAdminConfig() {
  const apiKey = process.env.CLOUDBASE_API_KEY?.trim() || process.env.CLOUDBASE_APIKEY?.trim();

  return Object.freeze({
    ...getCloudBaseConfig(),
    apiKey: required("CLOUDBASE_API_KEY or CLOUDBASE_APIKEY", apiKey),
  });
}
