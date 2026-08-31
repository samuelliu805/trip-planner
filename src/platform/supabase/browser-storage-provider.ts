"use client";

import type { BrowserStorageProvider, UploadInput } from "@/platform/contracts/storage";
import { PlatformOperationError } from "@/platform/contracts/errors";

import { createSupabaseBrowserClient } from "./client";

export class SupabaseBrowserStorageProvider implements BrowserStorageProvider {
  constructor(private readonly bucket: string) {}

  async upload(input: UploadInput) {
    const { data, error } = await createSupabaseBrowserClient()
      .storage.from(this.bucket)
      .upload(input.path, input.body, {
        cacheControl: input.cacheControl,
        contentType: input.contentType,
        upsert: input.upsert ?? false,
      });
    if (error || !data)
      throw new PlatformOperationError("unexpected", "Storage upload failed.", { cause: error });
    return { fullPath: data.fullPath, id: data.id, path: data.path };
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    const { error } = await createSupabaseBrowserClient().storage.from(this.bucket).remove(paths);
    if (error)
      throw new PlatformOperationError("unexpected", "Storage removal failed.", { cause: error });
  }
}
