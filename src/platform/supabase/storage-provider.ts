import "server-only";

import type { StorageProvider, UploadInput } from "@/platform/contracts/storage";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { createSupabaseAdminClient } from "./admin";
import { getSupabaseConfig } from "./config";

export function getSupabaseResumableUploadEndpoint() {
  const { url } = getSupabaseConfig();
  const projectUrl = new URL(url);
  const projectRef = projectUrl.hostname.match(/^([^.]+)\.supabase\.co$/)?.[1];
  const storageOrigin = projectRef
    ? `${projectUrl.protocol}//${projectRef}.storage.supabase.co`
    : projectUrl.origin;
  return `${storageOrigin}/storage/v1/upload/resumable`;
}

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

  async createSignedUrl(path: string, options?: { download?: string }) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(this.bucket)
      .createSignedUrl(
        path,
        this.signedUrlLifetimeSeconds,
        options?.download ? { download: options.download } : undefined,
      );
    if (error || !data)
      throw new PlatformOperationError("unexpected", "Signed URL creation failed.", {
        cause: error,
      });
    return data.signedUrl;
  }

  async createSignedUploadUrl(path: string) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(this.bucket)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data)
      throw new PlatformOperationError("unexpected", "Signed upload creation failed.", {
        cause: error,
      });
    return { signedUrl: data.signedUrl, token: data.token };
  }

  async download(path: string) {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from(this.bucket).download(path);
    if (error || !data)
      throw new PlatformOperationError("not_found", "Stored file download failed.", {
        cause: error,
      });
    return data;
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    const admin = createSupabaseAdminClient();
    const { error } = await admin.storage.from(this.bucket).remove(paths);
    if (error)
      throw new PlatformOperationError("unexpected", "Storage removal failed.", { cause: error });
  }
}
