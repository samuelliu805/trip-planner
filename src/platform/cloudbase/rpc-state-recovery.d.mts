type CloudBaseRpcResult = Readonly<{ data: unknown; error: unknown }>;

type StateMutationRecoveryKey =
  | Readonly<{ itemIds: string[]; kind: "clear-items" }>
  | Readonly<{ dayId: string; kind: "clear-day-route"; variantId: string }>
  | Readonly<{
      distance: number;
      duration: number | null;
      kind: "save-route-calculation";
      planId: string;
      schemaVersion: string;
      signature: string;
    }>
  | Readonly<{ itemId: string; kind: "detach-item-asset"; publicRef: string; tripId: string }>
  | Readonly<{
      kind: "detach-research-asset";
      publicRef: string;
      researchItemId: string;
      tripId: string;
    }>
  | Readonly<{
      itemId: string;
      kind: "discard-item-assets";
      sessionId: string;
      tripId: string;
    }>
  | Readonly<{
      kind: "discard-research-assets";
      researchItemId: string;
      sessionId: string;
      tripId: string;
    }>
  | Readonly<{ assetId: string; kind: "fail-item-asset" }>
  | Readonly<{ kind: "fail-share-image"; versionId: string }>
  | Readonly<{ kind: "revoke-share-page"; sharePageId: string }>
  | Readonly<{ exportId: string; kind: "revoke-share-image" }>;

export function cloudBaseStateMutationRecoveryKey(
  name: string,
  parameters: Readonly<Record<string, unknown>>,
  recoverable: boolean,
): StateMutationRecoveryKey | null;

export function recoverCloudBaseEmptyLookupResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
  data?: unknown,
): CloudBaseRpcResult;

export function recoverCloudBaseSingleLookupResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
  data?: unknown,
): CloudBaseRpcResult;

export function recoverCloudBaseNonNullLookupResult(
  original: CloudBaseRpcResult,
  lookup: CloudBaseRpcResult,
  field: string,
  data?: unknown,
): CloudBaseRpcResult;
