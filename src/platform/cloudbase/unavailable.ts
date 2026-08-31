import { PlatformOperationError } from "@/platform/contracts/errors";

export { cloudBasePhase3Status } from "./status";

export function cloudBaseProviderUnavailable(): never {
  throw new PlatformOperationError(
    "provider_unavailable",
    "CloudBase Storage is not implemented until Phase 4.",
  );
}
