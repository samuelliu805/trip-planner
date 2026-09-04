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

type CloudBaseScalarMutationRecoveryKey =
  | Readonly<{ dayNumber: number; kind: "insert-day"; tripId: string; variantId: string }>
  | Readonly<{ dayId: string; kind: "remove-day"; tripId: string; variantId: string }>
  | Readonly<{
      kind: "create-variant";
      tripId: string;
      variantColor: string;
      variantName: string;
    }>
  | Readonly<{
      kind: "update-variant";
      tripId: string;
      variantColor: string;
      variantId: string;
      variantName: string;
    }>
  | Readonly<{ kind: "primary-variant" | "delete-variant"; tripId: string; variantId: string }>;

type CloudBaseOrderMutationRecoveryKey =
  | Readonly<{ dayId: string; kind: "items"; orderedIds: string[] }>
  | Readonly<{ kind: "days"; orderedIds: string[]; tripId: string; variantId: string }>;

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

export function cloudBaseScalarMutationRecoveryKey(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
  recoverable: boolean,
): CloudBaseScalarMutationRecoveryKey | null;

export function cloudBaseOrderMutationRecoveryKey(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
  recoverable: boolean,
): CloudBaseOrderMutationRecoveryKey | null;

export function recoverCloudBaseScalarUuidResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
): CloudBaseRpcResult;

export function recoverCloudBaseDeletedUuidResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
  expectedId: string,
): CloudBaseRpcResult;

export function recoverCloudBaseOrderedVoidResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
  expectedIds: readonly string[],
): CloudBaseRpcResult;

export function recoverCloudBasePlaceUpsertResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
): CloudBaseRpcResult;
