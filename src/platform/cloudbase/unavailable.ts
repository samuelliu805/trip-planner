import { PlatformOperationError } from "@/platform/contracts/errors";

export { cloudBasePhase4Status } from "./status";

export function cloudBaseProviderUnavailable(): never {
  throw new PlatformOperationError(
    "provider_unavailable",
    "This CloudBase operation is not available for the CN deployment.",
  );
}
