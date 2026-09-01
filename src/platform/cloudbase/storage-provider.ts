import "server-only";

import type { StorageProvider, UploadInput } from "@/platform/contracts/storage";

import { createCloudBaseAdminClients } from "./client";
import { normalizeCloudBaseError } from "./errors";

export class CloudBaseStorageProvider implements StorageProvider {
  constructor(
    private readonly bucket: string,
    private readonly signedUrlLifetimeSeconds = 60,
  ) {}

  private storage() {
    return createCloudBaseAdminClients().storage.from(this.bucket);
  }

  async upload(input: UploadInput) {
    const result = await this.storage().upload(input.path, input.body, {
      cacheControl: input.cacheControl,
      contentType: input.contentType,
      upsert: input.upsert ?? false,
    });
    if (result.error || !result.data)
      throw normalizeCloudBaseError(result.error, "Storage upload failed.");
    return {
      fullPath: result.data.fullPath,
      id: result.data.id,
      path: result.data.path,
    };
  }

  async createSignedUrl(path: string, options?: { download?: string }) {
    const result = await this.storage().createSignedUrl(path, this.signedUrlLifetimeSeconds, {
      download: options?.download,
    });
    if (result.error || !result.data)
      throw normalizeCloudBaseError(result.error, "Signed URL creation failed.");
    return result.data.fullSignedURL;
  }

  async createSignedUploadUrl(path: string) {
    const result = await this.storage().createSignedUploadUrl(path, { upsert: false });
    if (result.error || !result.data)
      throw normalizeCloudBaseError(result.error, "Signed upload creation failed.");
    return { signedUrl: result.data.fullSignedURL, token: result.data.token };
  }

  async download(path: string) {
    const signedUrl = await this.createSignedUrl(path);
    const response = await fetch(signedUrl, { cache: "no-store" });
    if (!response.ok)
      throw normalizeCloudBaseError(
        { code: response.status, message: `Storage download returned ${response.status}` },
        "Stored file download failed.",
      );
    return response.blob();
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    const result = await this.storage().remove(paths);
    if (result.error) throw normalizeCloudBaseError(result.error, "Storage removal failed.");
  }
}
