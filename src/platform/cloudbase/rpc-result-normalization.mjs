export function normalizeCloudBaseRpcResult(name, result) {
  if (name !== "owns_pending_share_image_object_v1" || result?.error) return result;
  const data = result?.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return result;
  const keys = Object.keys(data);
  if (keys.length !== 1 || keys[0] !== "authorized" || typeof data.authorized !== "boolean") {
    return result;
  }
  return { ...result, data: data.authorized };
}
