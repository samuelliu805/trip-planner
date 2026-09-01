"use client";

import cloudbase from "@cloudbase/js-sdk";

import type {
  BrowserStorageProvider,
  SignedUploadInput,
  UploadInput,
} from "@/platform/contracts/storage";
import { PlatformOperationError } from "@/platform/contracts/errors";

function required(name: string, value: string | undefined) {
  if (value?.trim()) return value.trim();
  throw new PlatformOperationError(
    "provider_unavailable",
    `Missing required CloudBase browser configuration: ${name}.`,
  );
}

function createCloudBaseBrowserStorage() {
  const app = cloudbase.init({
    accessKey: required(
      "NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_CLOUDBASE_PUBLISHABLE_KEY,
    ),
    auth: { detectSessionInUrl: false },
    env: required("NEXT_PUBLIC_CLOUDBASE_ENV_ID", process.env.NEXT_PUBLIC_CLOUDBASE_ENV_ID),
    persistence: "none",
    region: required("NEXT_PUBLIC_CLOUDBASE_REGION", process.env.NEXT_PUBLIC_CLOUDBASE_REGION),
  });
  return app.storage;
}

export class CloudBaseBrowserStorageProvider implements BrowserStorageProvider {
  constructor(private readonly bucket: string) {}

  private storage() {
    return createCloudBaseBrowserStorage().from(this.bucket);
  }

  async upload(input: UploadInput) {
    const result = await this.storage().upload(input.path, input.body, {
      cacheControl: input.cacheControl,
      contentType: input.contentType,
      upsert: input.upsert ?? false,
    });
    if (result.error || !result.data)
      throw new PlatformOperationError("unexpected", "Storage upload failed.", {
        cause: result.error,
      });
    return result.data;
  }

  async uploadToSignedUrl(input: SignedUploadInput) {
    const result = await this.storage().uploadToSignedUrl(input.path, input.token, input.body, {
      cacheControl: input.cacheControl,
      contentType: input.contentType,
      upsert: input.upsert ?? false,
    });
    if (result.error || !result.data)
      throw new PlatformOperationError("unexpected", "Signed storage upload failed.", {
        cause: result.error,
      });
    return result.data;
  }

  async remove(paths: string[]) {
    if (!paths.length) return;
    const result = await this.storage().remove(paths);
    if (result.error)
      throw new PlatformOperationError("unexpected", "Storage removal failed.", {
        cause: result.error,
      });
  }
}
