import "server-only";

import type { StorageProvider, UploadInput } from "@/platform/contracts/storage";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { createSupabaseAdminClient } from "./admin";

export class SupabaseStorageProvider implements StorageProvider {
  constructor(
    private readonly bucket: string,
    private readonly signedUrlLifetimeSeconds = 60,
  ) {}

  async upload(input: UploadInput) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from(this.bucket).upload(input.path, input.body, {
      cacheControl: input.cacheControl,
      contentType: input.contentType,
      upsert: input.upsert ?? false,
    });
    if (error || !data)
      throw new PlatformOperationError("unexpected", "Storage upload failed.", { cause: error });
    return { fullPath: data.fullPath, id: data.id, path: data.path };
  }

  async createSignedUrl(path: string) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(this.bucket)
      .createSignedUrl(path, this.signedUrlLifetimeSeconds);
    if (error || !data)
      throw new PlatformOperationError("unexpected", "Signed URL creation failed.", {
        cause: error,
      });
    return data.signedUrl;
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    const admin = createSupabaseAdminClient();
    const { error } = await admin.storage.from(this.bucket).remove(paths);
    if (error)
      throw new PlatformOperationError("unexpected", "Storage removal failed.", { cause: error });
  }
}
