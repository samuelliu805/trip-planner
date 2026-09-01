export async function authorizePendingShareImageUpload(options) {
  const ownership = await options.database.rpc("owns_pending_share_image_object_v1", {
    requested_name: options.path,
  });
  if (ownership.error || ownership.data !== true) {
    return { error: "The image upload is not pending for this account." };
  }

  try {
    const authorization = await options.storage.createSignedUploadUrl(options.path);
    return { data: { ...authorization, path: options.path } };
  } catch {
    return { error: "The image upload could not be authorized." };
  }
}
