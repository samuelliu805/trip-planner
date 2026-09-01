import "server-only";

import { PlatformOperationError } from "@/platform/contracts/errors";

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
  return Object.freeze({
    ...getCloudBaseConfig(),
    apiKey: required("CLOUDBASE_API_KEY", process.env.CLOUDBASE_API_KEY),
  });
}
