"use client";

import cloudbase from "@cloudbase/js-sdk";

import type {
  BrowserStorageProvider,
  SignedUploadInput,
  UploadInput,
} from "../contracts/storage.ts";
import { PlatformOperationError } from "../contracts/errors.ts";
import { normalizeCloudBaseStorageUrl } from "./storage-url.ts";

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
  private readonly bucket: string;

  constructor(bucket: string) {
    this.bucket = bucket;
  }

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
    const target = new URL(normalizeCloudBaseStorageUrl(input.signedUrl));
    if (!target.searchParams.has("token")) target.searchParams.set("token", input.token);
    const body = new FormData();
    if (input.cacheControl) body.append("cacheControl", input.cacheControl);
    if (input.contentType) body.append("contentType", input.contentType);
    let uploadBody: Blob;
    if (input.body instanceof Blob) {
      uploadBody = input.body;
    } else if (input.body instanceof Uint8Array) {
      const bytes = new Uint8Array(input.body.byteLength);
      bytes.set(input.body);
      uploadBody = new Blob([bytes.buffer], {
        type: input.contentType ?? "application/octet-stream",
      });
    } else {
      uploadBody = new Blob([input.body], {
        type: input.contentType ?? "application/octet-stream",
      });
    }
    body.append("", uploadBody);
    let response: Response;
    try {
      response = await fetch(target, {
        body,
        credentials: "omit",
        method: "PUT",
      });
    } catch (cause) {
      throw new PlatformOperationError("unexpected", "Signed storage upload failed.", { cause });
    }
    if (!response.ok)
      throw new PlatformOperationError(
        "unexpected",
        `Signed storage upload returned ${response.status}.`,
      );
    const payload: unknown = await response.json().catch(() => null);
    const fullPath =
      payload && typeof payload === "object" && "Key" in payload && typeof payload.Key === "string"
        ? payload.Key
        : `${this.bucket}/${input.path}`;
    return { fullPath, path: input.path };
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
