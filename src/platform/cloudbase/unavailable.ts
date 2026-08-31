import { PlatformOperationError } from "@/platform/contracts/errors";

export { cloudBasePhase1Status } from "./status";

export function cloudBaseProviderUnavailable(): never {
  throw new PlatformOperationError(
    "provider_unavailable",
    "CloudBase backend adapters are not implemented in Phase 1.",
  );
}
