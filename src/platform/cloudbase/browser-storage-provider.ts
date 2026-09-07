"use client";

import cloudbase from "@cloudbase/js-sdk";

import type {
  BrowserStorageProvider,
  SignedUploadInput,
  UploadInput,
} from "../contracts/storage.ts";
import { PlatformOperationError } from "../contracts/errors.ts";
import { normalizeCloudBaseStorageUrl } from "./storage-url.ts";

const maximumSignedUploadAttempts = 3;
const signedUploadRetryDelayMs = 250;
const signedUploadTimeoutMs = 20_000;

type CloudBaseBrowserStorageProviderOptions = Readonly<{
  uploadTimeoutMs?: number;
  waitForRetry?: (milliseconds: number) => Promise<void>;
}>;

function retryableSignedUploadStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function defaultWaitForRetry(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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
  private readonly uploadTimeoutMs: number;
  private readonly waitForRetry: (milliseconds: number) => Promise<void>;

  constructor(bucket: string, options: CloudBaseBrowserStorageProviderOptions = {}) {
    this.bucket = bucket;
    this.uploadTimeoutMs = options.uploadTimeoutMs ?? signedUploadTimeoutMs;
    this.waitForRetry = options.waitForRetry ?? defaultWaitForRetry;
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
    let response: Response | undefined;
    for (let attempt = 1; attempt <= maximumSignedUploadAttempts; attempt += 1) {
      const body = new FormData();
      if (input.cacheControl) body.append("cacheControl", input.cacheControl);
      if (input.contentType) body.append("contentType", input.contentType);
      body.append("", uploadBody);
      try {
        response = await fetch(target, {
          body,
          credentials: "omit",
          method: "PUT",
          signal: AbortSignal.timeout(this.uploadTimeoutMs),
        });
      } catch (cause) {
        if (attempt === maximumSignedUploadAttempts)
          throw new PlatformOperationError("unexpected", "Signed storage upload failed.", {
            cause,
          });
        await this.waitForRetry(signedUploadRetryDelayMs * 2 ** (attempt - 1));
        continue;
      }
      if (
        response.ok ||
        !retryableSignedUploadStatus(response.status) ||
        attempt === maximumSignedUploadAttempts
      )
        break;
      await response.body?.cancel().catch(() => undefined);
      await this.waitForRetry(signedUploadRetryDelayMs * 2 ** (attempt - 1));
    }
    if (!response) throw new PlatformOperationError("unexpected", "Signed storage upload failed.");
    if (!response.ok)
      throw new PlatformOperationError(
        "unexpected",
        `Signed storage upload returned ${response.status}.`,
      );
    await response.body?.cancel().catch(() => undefined);
    return { fullPath: `${this.bucket}/${input.path}`, path: input.path };
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
