import { z } from "zod";

import type { AppUser } from "../../../platform/contracts/auth.ts";
import type { RelationalResult } from "../../../platform/contracts/relational.ts";
import type { StorageProvider, UploadInput } from "../../../platform/contracts/storage.ts";
import { isSameOriginRequest } from "../site-url.ts";
import {
  MAX_SHARE_IMAGE_PART_BYTES,
  ownedShareImagePath,
  shareImageUploadPathSchema,
} from "./storage-path.ts";

export { MAX_SHARE_IMAGE_PART_BYTES } from "./storage-path.ts";

type PendingUploadDatabase = Readonly<{
  rpc(
    name: "owns_pending_share_image_object_v1",
    parameters: { requested_name: string },
  ): PromiseLike<RelationalResult<boolean>>;
}>;

export type ShareImageFallbackUploadDependencies = Readonly<{
  getCurrentUser(): Promise<Pick<AppUser, "id"> | null>;
  getDatabase(): Promise<PendingUploadDatabase>;
  getStorage(): Pick<StorageProvider, "upload">;
}>;

const fallbackUploadHeadersSchema = z.object({
  path: shareImageUploadPathSchema,
  versionId: z.uuid(),
});

async function readBoundedBody(request: Request) {
  if (!request.body) return { status: "empty" as const };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SHARE_IMAGE_PART_BYTES) {
        await reader.cancel();
        return { status: "too_large" as const };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (!total) return { status: "empty" as const };
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body, status: "ok" as const };
}

function noStoreResponse(body: BodyInit | null, status: number) {
  return new Response(body, { headers: { "Cache-Control": "no-store" }, status });
}

export async function handleShareImageFallbackUpload(
  request: Request,
  dependencies: ShareImageFallbackUploadDependencies,
) {
  if (!isSameOriginRequest(request.headers)) return noStoreResponse(null, 403);
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "image/jpeg")
    return noStoreResponse(null, 415);

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 1) return noStoreResponse(null, 400);
    if (parsedLength > MAX_SHARE_IMAGE_PART_BYTES) return noStoreResponse(null, 413);
  }

  const headers = fallbackUploadHeadersSchema.safeParse({
    path: request.headers.get("x-trip-planner-share-image-path"),
    versionId: request.headers.get("x-trip-planner-share-image-version"),
  });
  if (!headers.success) return noStoreResponse(null, 400);

  const user = await dependencies.getCurrentUser();
  if (!user) return noStoreResponse(null, 401);
  if (!ownedShareImagePath(headers.data.path, user.id, headers.data.versionId))
    return noStoreResponse(null, 403);

  const bodyResult = await readBoundedBody(request);
  if (bodyResult.status === "too_large") return noStoreResponse(null, 413);
  if (bodyResult.status === "empty") return noStoreResponse(null, 400);
  const bytes = bodyResult.body;
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff ||
    bytes.at(-2) !== 0xff ||
    bytes.at(-1) !== 0xd9
  )
    return noStoreResponse(null, 415);

  const database = await dependencies.getDatabase();
  const ownership = await database.rpc("owns_pending_share_image_object_v1", {
    requested_name: headers.data.path,
  });
  if (ownership.error || ownership.data !== true) return noStoreResponse(null, 409);

  const upload: UploadInput = {
    body: bytes,
    cacheControl: "31536000",
    contentType: "image/jpeg",
    path: headers.data.path,
    // The direct request may have reached Storage even if its response never crossed the network.
    upsert: true,
  };
  try {
    await dependencies.getStorage().upload(upload);
  } catch {
    return noStoreResponse(null, 502);
  }
  return noStoreResponse(null, 204);
}
