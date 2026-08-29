"use client";

import { Upload } from "tus-js-client";

import {
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
  TUS_CHUNK_BYTES,
  attachmentLimitMessage,
  attachmentLimits,
  type AttachmentMimeType,
} from "./config";
import { detectAttachmentType } from "./file-signature";
import {
  attachmentSessionSchema,
  finalizedAttachmentSchema,
  preparedAttachmentSchema,
  type OwnerAttachment,
} from "./schema";
import {
  acknowledgeAttachmentFailure,
  attachmentFailureWasReported,
  attachmentUploadResponseError,
  attachmentUploadWasAborted,
} from "./upload-failure";

export type AttachmentUploadStage =
  "hashing" | "preparing" | "uploading" | "finalizing" | "complete";

export type AttachmentUploadProgress = {
  percent: number;
  stage: AttachmentUploadStage;
};

type UploadOptions = {
  file: File;
  itemId?: string;
  onProgress: (progress: AttachmentUploadProgress) => void;
  operationId: string;
  researchItemId?: string;
  signal: AbortSignal;
  tripId: string;
  uploadSessionId: string;
};

function responseError(payload: unknown, fallback: string) {
  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    typeof payload.error === "string"
  )
    return payload.error;
  return fallback;
}

async function signedStandardUpload({
  file,
  onProgress,
  signal,
  signedUrl,
}: {
  file: Blob;
  onProgress: (percent: number) => void;
  signal: AbortSignal;
  signedUrl: string;
}) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Upload canceled", "AbortError"));
      return;
    }
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file, "upload");
    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl);
    request.setRequestHeader("x-upsert", "false");
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () => reject(new Error("The upload was interrupted. Try again."));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("The private upload was rejected. Try again."));
    };
    const abort = () => {
      request.abort();
      reject(new DOMException("Upload canceled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    request.onloadend = () => signal.removeEventListener("abort", abort);
    request.send(body);
  });
}

async function signedTusUpload({
  file,
  mimeType,
  objectKey,
  onProgress,
  signal,
  token,
  tusEndpoint,
}: {
  file: File;
  mimeType: AttachmentMimeType;
  objectKey: string;
  onProgress: (percent: number) => void;
  signal: AbortSignal;
  token: string;
  tusEndpoint: string;
}) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Upload canceled", "AbortError"));
      return;
    }
    const upload = new Upload(file, {
      chunkSize: TUS_CHUNK_BYTES,
      endpoint: tusEndpoint,
      headers: { "x-signature": token },
      metadata: {
        bucketName: "trip-assets",
        cacheControl: "3600",
        contentType: mimeType,
        objectName: objectKey,
      },
      onError: () => {
        signal.removeEventListener("abort", abort);
        reject(new Error("The resumable upload was interrupted. Retry safely."));
      },
      onProgress: (uploaded, total) => onProgress(Math.round((uploaded / total) * 100)),
      onSuccess: () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      removeFingerprintOnSuccess: true,
      retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
      uploadDataDuringCreation: true,
    });
    const abort = () => {
      void upload.abort(false);
      reject(new DOMException("Upload canceled", "AbortError"));
    };
    signal.addEventListener("abort", abort, { once: true });
    void upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      })
      .catch(() => upload.start());
  });
}

async function videoPoster(file: File) {
  const source = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;
    video.src = source;
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("poster timeout")), 8_000);
      video.onloadedmetadata = () => {
        window.clearTimeout(timeout);
        video.currentTime = Math.min(1, Math.max(0, video.duration * 0.08));
      };
      video.onseeked = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timeout);
        reject(new Error("poster unavailable"));
      };
    });
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.78));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function uploadFileAttachment({
  file,
  itemId,
  onProgress,
  operationId,
  researchItemId,
  signal,
  tripId,
  uploadSessionId,
}: UploadOptions): Promise<OwnerAttachment> {
  const targetPath = researchItemId
    ? `research/${researchItemId}`
    : itemId
      ? `items/${itemId}`
      : null;
  if (!targetPath) throw new Error("The attachment target is unavailable.");
  onProgress({ percent: 3, stage: "hashing" });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectAttachmentType(bytes);
  if (!detected) {
    const heic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    throw new Error(
      heic
        ? "HEIC is not supported yet. Convert it to JPEG, PNG, or WebP before uploading."
        : "This file is not a supported JPEG, PNG, WebP, PDF, MP4, WebM, or QuickTime/MOV file.",
    );
  }
  if (file.size > attachmentLimits[detected.kind])
    throw new Error(attachmentLimitMessage(detected.kind));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  onProgress({ percent: 10, stage: "preparing" });
  const prepareResponse = await fetch(`/api/trips/${tripId}/${targetPath}/attachments/prepare`, {
    body: JSON.stringify({
      byteSize: file.size,
      fileName: file.name,
      kind: detected.kind,
      mimeType: detected.mimeType,
      sha256,
      uploadSessionId,
      operationId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
  const preparePayload: unknown = await prepareResponse.json().catch(() => null);
  if (!prepareResponse.ok)
    throw attachmentUploadResponseError(preparePayload, "The upload could not be prepared.");
  const prepared = preparedAttachmentSchema.safeParse(preparePayload);
  if (!prepared.success) throw new Error("The private upload authorization is invalid.");
  if (!prepared.data.uploadRequired) {
    onProgress({ percent: 100, stage: "complete" });
    return prepared.data.attachment;
  }
  if (!prepared.data.upload) throw new Error("The private upload authorization is missing.");

  const lifecycleUrl = `/api/trips/${tripId}/${targetPath}/attachments/${prepared.data.assetId}/finalize`;
  try {
    const normalizedFile = new File([file], file.name, {
      lastModified: file.lastModified,
      type: detected.mimeType,
    });
    onProgress({ percent: 12, stage: "uploading" });
    if (file.size > RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
      await signedTusUpload({
        file: normalizedFile,
        mimeType: detected.mimeType,
        objectKey: prepared.data.upload.objectKey,
        onProgress: (percent) =>
          onProgress({ percent: 12 + Math.round(percent * 0.72), stage: "uploading" }),
        signal,
        token: prepared.data.upload.token,
        tusEndpoint: prepared.data.upload.tusEndpoint,
      });
    } else {
      await signedStandardUpload({
        file: normalizedFile,
        onProgress: (percent) =>
          onProgress({ percent: 12 + Math.round(percent * 0.72), stage: "uploading" }),
        signal,
        signedUrl: prepared.data.upload.signedUrl,
      });
    }

    let posterUploaded = false;
    if (detected.kind === "video" && prepared.data.posterUpload) {
      const poster = await videoPoster(normalizedFile);
      if (poster) {
        try {
          await signedStandardUpload({
            file: poster,
            onProgress: () => undefined,
            signal,
            signedUrl: prepared.data.posterUpload.signedUrl,
          });
          posterUploaded = true;
        } catch {
          posterUploaded = false;
        }
      }
    }

    onProgress({ percent: 88, stage: "finalizing" });
    const finalizeResponse = await fetch(lifecycleUrl, {
      body: JSON.stringify({ operationId, posterUploaded }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
    });
    const finalizePayload: unknown = await finalizeResponse.json().catch(() => null);
    if (!finalizeResponse.ok)
      throw attachmentUploadResponseError(finalizePayload, "The upload could not be verified.");
    const finalized = finalizedAttachmentSchema.safeParse(finalizePayload);
    if (!finalized.success) throw new Error("The verified attachment response is invalid.");
    onProgress({ percent: 100, stage: "complete" });
    return finalized.data.attachment;
  } catch (error) {
    if (attachmentFailureWasReported(error)) throw error;
    const aborted = attachmentUploadWasAborted(error);
    let failureReported = false;
    try {
      const cleanupResponse = await fetch(lifecycleUrl, {
        body: JSON.stringify({ failure: !aborted, operationId }),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        method: "DELETE",
      });
      if (!aborted) {
        const cleanupPayload: unknown = cleanupResponse.ok
          ? null
          : await cleanupResponse.json().catch(() => null);
        failureReported =
          cleanupResponse.ok ||
          attachmentFailureWasReported(attachmentUploadResponseError(cleanupPayload, ""));
      }
    } catch {
      // The component fallback owns reporting when the lifecycle request cannot acknowledge it.
    }
    throw failureReported ? acknowledgeAttachmentFailure(error) : error;
  }
}

function attachmentSessionUrl({
  itemId,
  researchItemId,
  tripId,
  uploadSessionId,
}: {
  itemId?: string;
  researchItemId?: string;
  tripId: string;
  uploadSessionId: string;
}) {
  const targetPath = researchItemId
    ? `research/${researchItemId}`
    : itemId
      ? `items/${itemId}`
      : null;
  if (!targetPath) throw new Error("The attachment target is unavailable.");
  return `/api/trips/${tripId}/${targetPath}/attachments/session/${uploadSessionId}`;
}

export async function commitAttachmentUploadSession(input: {
  itemId?: string;
  researchItemId?: string;
  tripId: string;
  uploadSessionId: string;
}) {
  const response = await fetch(attachmentSessionUrl(input), { method: "POST" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(responseError(payload, "The new attachments could not be saved."));
  const attachments = attachmentSessionSchema.safeParse(payload);
  if (!attachments.success) throw new Error("The saved attachment response is invalid.");
  return attachments.data;
}

export async function discardAttachmentUploadSession(
  input: { itemId?: string; researchItemId?: string; tripId: string; uploadSessionId: string },
  keepalive = false,
) {
  const response = await fetch(attachmentSessionUrl(input), { keepalive, method: "DELETE" });
  if (response.ok) return;
  const payload: unknown = await response.json().catch(() => null);
  throw new Error(responseError(payload, "The unused attachments could not be removed."));
}
