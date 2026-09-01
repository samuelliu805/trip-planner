type CloudBaseRpcResult = Readonly<{
  data: unknown;
  error: unknown;
}>;

export function normalizeCloudBaseRpcResult(
  name: string,
  result: CloudBaseRpcResult,
): CloudBaseRpcResult;
