"use client";

import type {
  BrowserStorageProvider,
  SignedUploadInput,
} from "../../../platform/contracts/storage.ts";

type UploadShareImagePartInput = Omit<SignedUploadInput, "body"> &
  Readonly<{ body: Blob; versionId: string }>;

const maximumFallbackUploadAttempts = 3;
const fallbackUploadRetryDelayMs = 500;

function retryableFallbackStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function defaultWaitForRetry(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function uploadShareImagePart(
  storage: Pick<BrowserStorageProvider, "uploadToSignedUrl">,
  input: UploadShareImagePartInput,
  fetchImplementation: typeof fetch = fetch,
  waitForRetry: (milliseconds: number) => Promise<void> = defaultWaitForRetry,
) {
  const { versionId, ...directInput } = input;
  let directFailure: unknown;
  try {
    await storage.uploadToSignedUrl(directInput);
    return;
  } catch (error) {
    directFailure = error;
  }

  for (let attempt = 1; attempt <= maximumFallbackUploadAttempts; attempt += 1) {
    try {
      const response = await fetchImplementation("/api/share-images/upload", {
        body: input.body,
        credentials: "same-origin",
        headers: {
          "Content-Type": "image/jpeg",
          "X-Trip-Planner-Share-Image-Path": input.path,
          "X-Trip-Planner-Share-Image-Version": versionId,
        },
        method: "POST",
      });
      if (response.ok) return;
      if (!retryableFallbackStatus(response.status) || attempt === maximumFallbackUploadAttempts)
        break;
      await response.body?.cancel().catch(() => undefined);
    } catch {
      if (attempt === maximumFallbackUploadAttempts) break;
    }
    await waitForRetry(fallbackUploadRetryDelayMs * 2 ** (attempt - 1));
  }
  // Preserve the provider error so the UI reports the original failed operation.
  throw directFailure;
}
