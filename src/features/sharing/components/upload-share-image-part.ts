"use client";

import type {
  BrowserStorageProvider,
  SignedUploadInput,
} from "../../../platform/contracts/storage.ts";

type UploadShareImagePartInput = Omit<SignedUploadInput, "body"> &
  Readonly<{ body: Blob; versionId: string }>;

export async function uploadShareImagePart(
  storage: Pick<BrowserStorageProvider, "uploadToSignedUrl">,
  input: UploadShareImagePartInput,
  fetchImplementation: typeof fetch = fetch,
) {
  const { versionId, ...directInput } = input;
  let directFailure: unknown;
  try {
    await storage.uploadToSignedUrl(directInput);
    return;
  } catch (error) {
    directFailure = error;
  }

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
  } catch {
    // Preserve the provider error so the UI reports the original failed operation.
  }
  throw directFailure;
}
