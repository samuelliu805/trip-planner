import { PlatformOperationError } from "@/platform/contracts/errors";

export const cloudBasePhase1Status = Object.freeze({
  authImplemented: false,
  dataImplemented: false,
  runtimeReady: false,
  storageImplemented: false,
});

export function cloudBaseProviderUnavailable(): never {
  throw new PlatformOperationError(
    "provider_unavailable",
    "CloudBase backend adapters are not implemented in Phase 1.",
  );
}
