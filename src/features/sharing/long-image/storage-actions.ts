"use server";

import { z } from "zod";

import {
  getAuthProvider,
  getBackendCapabilities,
  getRelationalDatabase,
  getStorageProvider,
} from "@/platform/composition/server";

import { authorizePendingShareImageUpload } from "./storage-authorization.mjs";
import { ownedShareImagePath, shareImageUploadPathSchema } from "./storage-path";

export async function authorizeShareImageUpload(input: { path: string; versionId: string }) {
  if (!getBackendCapabilities().signedUrls)
    return { error: "Permanent image exports are not supported by this backend." };
  const parsed = z
    .object({ path: shareImageUploadPathSchema, versionId: z.uuid() })
    .strict()
    .safeParse(input);
  if (!parsed.success) return { error: "The image upload path is invalid." };
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: "Sign in to upload a permanent image." };
  if (!ownedShareImagePath(parsed.data.path, user.id, parsed.data.versionId))
    return { error: "The image upload path is not owned by this account." };
  const database = await getRelationalDatabase();
  return authorizePendingShareImageUpload({
    database,
    path: parsed.data.path,
    storage: getStorageProvider("share-images"),
  });
}

export async function removeShareImageUploads(rawPaths: string[]) {
  const paths = z.array(shareImageUploadPathSchema).max(20).safeParse(rawPaths);
  if (!paths.success || !paths.data.length) return { error: "The image cleanup path is invalid." };
  const user = await getAuthProvider().getCurrentUser();
  if (!user) return { error: "Sign in to remove image uploads." };
  if (paths.data.some((path) => !ownedShareImagePath(path, user.id)))
    return { error: "The image cleanup path is not owned by this account." };
  try {
    await getStorageProvider("share-images").remove(paths.data);
    return { data: { removed: paths.data.length } };
  } catch {
    return { error: "The image uploads could not be removed." };
  }
}
