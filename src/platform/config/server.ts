import "server-only";

import { resolveDeploymentProviderConfig, type ProviderEnvironment } from "./provider-matrix";

export function getServerProviderConfig(
  env: ProviderEnvironment = process.env as ProviderEnvironment,
) {
  return resolveDeploymentProviderConfig(env);
}
