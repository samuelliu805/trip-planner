"use server";

import { z } from "zod";

import {
  getAuthProvider,
  getBackendCapabilities,
  getRelationalDatabase,
  getStorageProvider,
} from "@/platform/composition/server";

import { authorizePendingShareImageUpload } from "./storage-authorization.mjs";

const shareImageUploadPathSchema = z
  .string()
  .min(1)
  .max(1_000)
  .refine((path) => {
    const parts = path.split("/");
    return (
      parts.length === 4 &&
      z.uuid().safeParse(parts[1]).success &&
      z.uuid().safeParse(parts[2]).success &&
      /^part-[1-9][0-9]*\.jpg$/.test(parts[3])
    );
  });

function ownedShareImagePath(path: string, userId: string, versionId?: string) {
  const parsed = shareImageUploadPathSchema.safeParse(path);
  if (!parsed.success) return false;
  const parts = parsed.data.split("/");
  return parts[0] === userId && (!versionId || parts[2] === versionId);
}

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
