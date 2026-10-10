"use client";
import { getBrowserStorageProvider } from "@/platform/composition/client";
import { isAccountActive } from "@/features/editing/account-runtime";
import type { BackgroundActionIntent } from "@/features/editing/background-action-intent";
import { prepareShareImageVersion, finalizeShareImageVersion } from "./actions";
import { authorizeShareImageUpload } from "./storage-actions";
import { prepareShareImageSchema, shareImagePartInputSchema } from "./schema";
import { uploadShareImagePart } from "../components/upload-share-image-part";
import { imageExportStorage } from "./image-export-storage";
import type { OwnerShareImageState } from "../types";

type Input = Extract<BackgroundActionIntent, { kind: "image.generate" }>["input"];
/** Once rendering finishes, retries resume identical bytes and finalize never deletes unknown outcomes. */
export async function runImageExport(input: Input, scope: string[]): Promise<OwnerShareImageState> {
  const guard = () => {
    if (!isAccountActive(scope[1]))
      throw new Error("Sign in to the export's account to resume it.");
  };
  guard();
  let job = await imageExportStorage.get(input.operationId);
  if (!job) {
    const prepared = await prepareShareImageVersion({
      exportId: input.mode === "replace_existing" ? (input.imageState?.exportId ?? null) : null,
      locale: input.locale,
      mode: input.mode,
      operationId: input.operationId,
      sharePageId: input.sharePage.id,
      scope: input.scope,
    });
    if ("error" in prepared) throw new Error(prepared.error);
    guard();
    job = { id: input.operationId, scope, prepared: prepared.data };
    await imageExportStorage.put(job);
  }
  const prepared = prepareShareImageSchema.parse(job.prepared);
  if (
    JSON.stringify(job.scope) !== JSON.stringify(scope) ||
    prepared.uploadPathPrefix.split("/")[0] !== scope[1]
  )
    throw new Error("This saved export belongs to another account.");
  guard();
  if (!job.parts) {
    const { renderTimelineExport, sha256 } = await import("./dom-renderer");
    const rendered = await renderTimelineExport({
      destinationUrl: prepared.qrDestinationUrl,
      destinationType: prepared.qrDestinationType,
      itinerary: prepared.sourceSnapshot,
      locale: input.locale,
      templateId: input.sharePage.templateId,
      templateVersion: input.sharePage.templateVersion,
    });
    guard();
    job.parts = await Promise.all(
      rendered.map(async (part, index) => ({
        blob: part.blob,
        uploaded: false,
        metadata: {
          byteSize: part.blob.size,
          checksum: await sha256(part.blob),
          contentType: "image/jpeg" as const,
          height: part.height,
          width: part.width as 1080,
          partNumber: index + 1,
          storagePath: `${prepared.uploadPathPrefix}/part-${index + 1}.jpg`,
        },
      })),
    );
    await imageExportStorage.put(job); // Completed transaction precedes upload and survives refresh.
  }
  for (const part of job.parts) {
    shareImagePartInputSchema.parse(part.metadata);
    if (!(part.blob instanceof Blob) || part.blob.size !== part.metadata.byteSize)
      throw new Error("The saved export bytes could not be recovered.");
    if (part.uploaded || job.finalizing) continue;
    guard();
    const authorization = await authorizeShareImageUpload({
      path: part.metadata.storagePath,
      versionId: prepared.versionId,
    });
    if ("error" in authorization) throw new Error(authorization.error);
    guard();
    await uploadShareImagePart(getBrowserStorageProvider("share-images"), {
      body: part.blob,
      cacheControl: "31536000",
      contentType: "image/jpeg",
      path: part.metadata.storagePath,
      signedUrl: authorization.data.signedUrl,
      token: authorization.data.token,
      upsert: true,
      versionId: prepared.versionId,
    });
    part.uploaded = true;
    await imageExportStorage.put(job);
  }
  guard();
  job.finalizing = true;
  await imageExportStorage.put(job);
  const finalized = await finalizeShareImageVersion({
    exportMode: input.mode === "replace_existing" ? "replace" : "new",
    operationId: input.finalizeOperationId,
    parts: job.parts.map((part) => part.metadata),
    versionId: prepared.versionId,
  });
  if ("error" in finalized) throw new Error(finalized.error);
  const now = new Date().toISOString();
  return {
    createdAt: input.mode === "replace_existing" ? (input.imageState?.createdAt ?? now) : now,
    expiresAt: finalized.data.expiresAt,
    exportId: prepared.exportId,
    partCount: finalized.data.partCount,
    permanentSlug: finalized.data.permanentSlug,
    renderConfig: prepared.renderConfig,
    sourceSnapshotHash: prepared.sourceSnapshotHash,
    updatedAt: now,
    versionNumber: prepared.versionNumber,
  };
}
