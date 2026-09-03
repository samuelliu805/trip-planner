import { PlatformOperationError } from "@/platform/contracts/errors";

export function providerOperationUnavailable(): never {
  throw new PlatformOperationError(
    "provider_unavailable",
    "This operation is not available for the selected deployment region.",
  );
}
