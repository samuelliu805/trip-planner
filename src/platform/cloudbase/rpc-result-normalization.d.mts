type CloudBaseRpcResult = Readonly<{
  data: unknown;
  error: unknown;
}>;

export function normalizeCloudBaseRpcResult(
  name: string,
  result: CloudBaseRpcResult,
): CloudBaseRpcResult;

type CloudBasePlaceRecoveryKey = Readonly<{
  provider: "amap" | "google";
  providerPlaceId: string;
  tripId: string;
}>;

type CloudBaseDayRoutePlanRecoveryKey = Readonly<{
  dayId: string;
  variantId: string;
}>;

export function cloudBasePlaceUpsertRecoveryKey(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
  recoverable: boolean,
): CloudBasePlaceRecoveryKey | null;

export function cloudBaseDayRoutePlanRecoveryKey(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
  recoverable: boolean,
): CloudBaseDayRoutePlanRecoveryKey | null;

export function recoverCloudBaseScalarUuidResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
): CloudBaseRpcResult;

export function recoverCloudBasePlaceUpsertResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
): CloudBaseRpcResult;
