import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { publicItemMediaSchema } from "../sharing/schema.ts";
import {
  MAX_ATTACHMENTS_PER_ITEM,
  MAX_IMAGE_BYTES,
  MAX_ITEM_ATTACHMENT_BYTES,
  MAX_OWNER_ASSET_BYTES,
  MAX_PDF_BYTES,
  MAX_VIDEO_BYTES,
  TUS_CHUNK_BYTES,
} from "./config.ts";
import { detectAttachmentType } from "./file-signature.ts";
import { ownerAttachmentsFromRows } from "./owner-attachment-records.ts";
import { attachmentError, prepareAttachmentInputSchema } from "./schema.ts";

const encoder = new TextEncoder();

function bytes(...parts: (number[] | string)[]) {
  return new Uint8Array(
    parts.flatMap((part) => (typeof part === "string" ? [...encoder.encode(part)] : part)),
  );
}

test("attachment limits remain the fixed shared product contract", () => {
  assert.deepEqual(
    {
      itemBytes: MAX_ITEM_ATTACHMENT_BYTES,
      itemCount: MAX_ATTACHMENTS_PER_ITEM,
      ownerBytes: MAX_OWNER_ASSET_BYTES,
      imageBytes: MAX_IMAGE_BYTES,
      pdfBytes: MAX_PDF_BYTES,
      tusChunk: TUS_CHUNK_BYTES,
      videoBytes: MAX_VIDEO_BYTES,
    },
    {
      itemBytes: 50 * 1024 * 1024,
      itemCount: 5,
      ownerBytes: 250 * 1024 * 1024,
      imageBytes: 10 * 1024 * 1024,
      pdfBytes: 20 * 1024 * 1024,
      tusChunk: 6 * 1024 * 1024,
      videoBytes: 30 * 1024 * 1024,
    },
  );
});

test("magic-byte detection accepts only the supported complete container signatures", () => {
  const jpeg = bytes([0xff, 0xd8, 0xff], "photo", [0xff, 0xd9]);
  const png = bytes(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    [0, 0, 0, 0],
    "IHDR",
    "payload-IEND",
  );
  const webp = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 payload");
  const pdf = bytes("%PDF-1.7\ntravel ticket\n%%EOF\n");
  const webm = bytes([0x1a, 0x45, 0xdf, 0xa3], "webm", "0".repeat(32));
  const mp4 = bytes([0, 0, 0, 32], "ftyp", "isom", "moov", "vide", "mdat");
  const mov = bytes([0, 0, 0, 32], "ftyp", "qt  ", "moov", "vide", "mdat");

  assert.equal(detectAttachmentType(jpeg)?.mimeType, "image/jpeg");
  assert.equal(detectAttachmentType(png)?.mimeType, "image/png");
  assert.equal(detectAttachmentType(webp)?.mimeType, "image/webp");
  assert.equal(detectAttachmentType(pdf)?.mimeType, "application/pdf");
  assert.equal(detectAttachmentType(webm)?.mimeType, "video/webm");
  assert.equal(detectAttachmentType(mp4)?.mimeType, "video/mp4");
  assert.equal(detectAttachmentType(mov)?.mimeType, "video/quicktime");
});

test("spoofed and explicitly unsupported formats fail before upload", () => {
  assert.equal(detectAttachmentType(bytes("<html><script>alert(1)</script></html>")), null);
  assert.equal(detectAttachmentType(bytes("%PDF-1.7\nmissing trailer")), null);
  assert.equal(detectAttachmentType(bytes([0, 0, 0, 24], "ftyp", "heic", "mdat")), null);
  assert.equal(detectAttachmentType(bytes([0, 0, 0, 24], "ftyp", "isom", "moov", "mdat")), null);
});

test("prepare validation uses matching media kinds and per-type limits", () => {
  const base = {
    byteSize: 1_024,
    fileName: "ticket.pdf",
    kind: "pdf" as const,
    mimeType: "application/pdf" as const,
    sha256: "a".repeat(64),
    uploadSessionId: "00000000-0000-4000-8000-000000000002",
  };
  assert.equal(prepareAttachmentInputSchema.safeParse(base).success, true);
  assert.equal(
    prepareAttachmentInputSchema.safeParse({ ...base, byteSize: MAX_PDF_BYTES + 1 }).success,
    false,
  );
  assert.equal(prepareAttachmentInputSchema.safeParse({ ...base, kind: "image" }).success, false);
  assert.equal(
    prepareAttachmentInputSchema.safeParse({ ...base, fileName: "bad\u0000name.pdf" }).success,
    false,
  );
});

test("public attachment media accepts only the exact application access route", () => {
  const token = "00000000-0000-4000-8000-000000000001";
  const publicRef = "b".repeat(64);
  const valid = {
    byteSize: 1_024,
    id: publicRef,
    kind: "pdf" as const,
    label: "Ticket.pdf",
    mimeType: "application/pdf" as const,
    source: "attachment" as const,
    url: `/api/share/${token}/assets/${publicRef}`,
  };
  assert.equal(publicItemMediaSchema.safeParse(valid).success, true);
  assert.equal(
    publicItemMediaSchema.safeParse({ ...valid, url: `/storage/v1/object/sign/${publicRef}` })
      .success,
    false,
  );
  assert.equal(
    publicItemMediaSchema.safeParse({ ...valid, url: `https://assets.example.com/${publicRef}` })
      .success,
    false,
  );
});

test("database lifecycle errors remain actionable", () => {
  assert.match(attachmentError("ATTACHMENT_DUPLICATE"), /already attached/i);
  assert.match(attachmentError("ATTACHMENT_COUNT_LIMIT"), /five attachments/i);
  assert.match(attachmentError("ATTACHMENT_ITEM_BYTES_LIMIT"), /50 MB/i);
  assert.match(attachmentError("ATTACHMENT_OWNER_BYTES_LIMIT"), /250 MB/i);
  assert.match(attachmentError("ATTACHMENT_TYPE_UNSUPPORTED"), /HEIC is not supported/i);
});

test("owner attachment query rows remain attached to saved planner items", () => {
  const publicRef = "c".repeat(64);
  assert.deepEqual(
    ownerAttachmentsFromRows([
      {
        asset: {
          byte_size: 4_096,
          duration_seconds: null,
          height: 800,
          media_kind: "image",
          mime_type: "image/jpeg",
          status: "ready",
          width: 1_200,
        },
        created_at: "2026-08-17T12:00:00.000Z",
        draft_session_id: null,
        display_filename: "museum.jpg",
        id: "00000000-0000-4000-8000-000000000003",
        include_in_share: true,
        public_ref: publicRef,
        sort_order: 0,
      },
    ]),
    [
      {
        byteSize: 4_096,
        createdAt: "2026-08-17T12:00:00.000Z",
        draft: false,
        durationSeconds: null,
        fileName: "museum.jpg",
        height: 800,
        id: "00000000-0000-4000-8000-000000000003",
        includeInShare: true,
        kind: "image",
        mimeType: "image/jpeg",
        publicRef,
        sortOrder: 0,
        status: "ready",
        width: 1_200,
      },
    ],
  );
});

test("upload and viewer source retain private, resumable, and expiry safeguards", async () => {
  const upload = await readFile(new URL("./upload-client.ts", import.meta.url), "utf8");
  const viewer = await readFile(
    new URL("./components/attachment-viewer.tsx", import.meta.url),
    "utf8",
  );
  const continuousPdf = await readFile(
    new URL("./components/continuous-pdf-viewer.tsx", import.meta.url),
    "utf8",
  );
  const pdfPreview = await readFile(
    new URL("./components/attachment-pdf-preview.tsx", import.meta.url),
    "utf8",
  );
  const publicRoute = await readFile(
    new URL("../../app/api/share/[token]/assets/[publicRef]/route.ts", import.meta.url),
    "utf8",
  );
  const publicMedia = await readFile(
    new URL("../sharing/components/public-item-media.tsx", import.meta.url),
    "utf8",
  );
  const itemAction = await readFile(new URL("../itinerary/actions.ts", import.meta.url), "utf8");
  const itemForm = await readFile(
    new URL("../itinerary/components/planner-item-form.tsx", import.meta.url),
    "utf8",
  );
  const plannerForm = await readFile(
    new URL("../itinerary/components/planner-editor-form.tsx", import.meta.url),
    "utf8",
  );
  const plannerSheets = await readFile(
    new URL("../itinerary/components/planner-item-editor-dialog.tsx", import.meta.url),
    "utf8",
  );
  const plannerEditor = await readFile(
    new URL("../itinerary/components/planner-editor-screen.tsx", import.meta.url),
    "utf8",
  );
  const plannerStyles = await readFile(
    new URL("../../app/planner-item-dialog.css", import.meta.url),
    "utf8",
  );
  const attachmentSession = await readFile(
    new URL("../itinerary/components/use-attachment-edit-session.ts", import.meta.url),
    "utf8",
  );
  const cleanup = await readFile(new URL("./cleanup.server.ts", import.meta.url), "utf8");
  const formControls = await Promise.all(
    [
      "../../components/ui/input.tsx",
      "../../components/ui/select.tsx",
      "../../components/ui/textarea.tsx",
      "../itinerary/components/booking-price-fields.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const sessionRoute = await readFile(
    new URL(
      "../../app/api/trips/[tripId]/items/[itemId]/attachments/session/[sessionId]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const attachmentSection = await readFile(
    new URL("./components/item-attachments-section.tsx", import.meta.url),
    "utf8",
  );
  const ownerAttachment = await readFile(
    new URL("./components/owner-attachment-card.tsx", import.meta.url),
    "utf8",
  );
  const viewerStyles = await readFile(
    new URL("../../app/attachment-viewer.css", import.meta.url),
    "utf8",
  );
  const publicMediaStyles = await readFile(
    new URL("../../app/public-attachments.css", import.meta.url),
    "utf8",
  );
  const publicViews = await Promise.all(
    [
      "../sharing/components/public-overview-card.tsx",
      "../sharing/components/public-overview-transport-list.tsx",
      "../sharing/components/public-table.tsx",
      "../sharing/components/public-timeline-day.tsx",
      "../sharing/components/public-timeline-node.tsx",
      "../sharing/components/public-timeline-transport.tsx",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );
  const longImage = await readFile(
    new URL("../sharing/long-image/actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(upload, /x-signature/);
  assert.match(upload, /retryDelays/);
  assert.match(upload, /findPreviousUploads/);
  assert.match(upload, /keepalive: true, method: "DELETE"/);
  assert.match(viewer, /handlePreviewError/);
  assert.match(viewer, /ArrowLeft/);
  assert.match(viewer, /playsInline/);
  assert.match(viewer, /AttachmentPdfPreview/);
  assert.match(pdfPreview, /loadContinuousPdfViewer/);
  assert.match(pdfPreview, /preloadAttachmentPdfViewer/);
  assert.match(pdfPreview, /void fetch\(url/);
  assert.match(pdfPreview, /URL\.createObjectURL/);
  assert.match(viewer, /fixed inset-0 h-dvh[\s\S]*overflow-hidden/);
  assert.doesNotMatch(viewer, /<iframe/);
  assert.match(continuousPdf, /Array\.from\(\{ length: pageCount \}/);
  assert.match(continuousPdf, /data-continuous-pdf/);
  assert.match(continuousPdf, /data-pdf-page/);
  assert.match(viewer, /attachment-viewer-slide/);
  assert.match(viewerStyles, /@keyframes attachment-slide-next/);
  assert.match(viewerStyles, /react-pdf__Page__canvas[\s\S]*margin-left: auto/);
  assert.match(publicMedia, /AttachmentViewer/);
  assert.match(publicMedia, /onPointerEnter=\{attachment\.kind === "pdf"/);
  assert.match(publicMedia, /AttachmentButtons/);
  assert.match(publicMedia, /google-place/);
  assert.match(publicMedia, /public-item-attachments/);
  assert.doesNotMatch(publicMedia, /media-preview-button-v4/);
  assert.doesNotMatch(publicMedia, /\bEye\b|· View|>View</);
  assert.match(publicMedia, /return "Image"/);
  assert.match(publicMedia, /return "Video"/);
  assert.match(publicMedia, /return "PDF"/);
  assert.match(publicMedia, /attachments\.map\(\(attachment\)/);
  assert.match(publicMedia, /public-attachment-button/);
  assert.match(publicMediaStyles, /\.public-attachment-button \{[\s\S]*min-height: 2\.75rem/);
  assert.match(publicMediaStyles, /grid-template-columns: repeat\(auto-fill/);
  assert.match(publicMediaStyles, /minmax\(min\(100%, 9\.5rem\), min\(100%, 12\.5rem\)\)/);
  assert.match(ownerAttachment, /> Preview/);
  assert.match(viewerStyles, /\.attachment-viewer \{[\s\S]*height: 100dvh/);
  assert.match(viewerStyles, /\.app-dialog-close[\s\S]*width: 2\.75rem[\s\S]*color: white/);
  assert.match(
    viewerStyles,
    /data-attachment-viewer-scroll[\s\S]*-webkit-overflow-scrolling: touch/,
  );
  assert.match(itemAction, /attachments:asset_links/);
  assert.match(itemAction, /ownerAttachmentsFromRows\(attachmentRows\)/);
  assert.match(attachmentSection, /onPendingChange\?\.\(pending\)/);
  assert.match(attachmentSection, /ShareAttachmentsCallout/);
  assert.match(itemForm, /attachmentSession\.attachmentPending \? "Updating attachments…"/);
  assert.match(plannerForm, /min-w-0 flex-1 flex-col overflow-hidden/);
  assert.match(plannerForm, /<PlannerEditorPage/);
  assert.match(
    plannerEditor,
    /overflow-x-hidden[\s\S]*overflow-y-auto[\s\S]*data-planner-editor-scroll/,
  );
  assert.match(plannerSheets, /<PlannerEditorScreen/);
  assert.match(plannerEditor, /planner-item-dialog/);
  assert.doesNotMatch(itemForm + plannerForm, /data-planner-editor-actions/);
  assert.match(
    plannerStyles,
    /\.planner-item-dialog \{[\s\S]*overflow: hidden[\s\S]*overscroll-behavior: none[\s\S]*touch-action: pan-y/,
  );
  assert.equal(
    publicViews.every((source) => /PublicItemMediaGallery/.test(source)),
    true,
  );
  assert.match(publicRoute, /service_public_asset_access_v2/);
  assert.match(publicRoute, /private, no-store/);
  assert.match(longImage, /source !== "attachment"/);
  assert.doesNotMatch(publicRoute, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(attachmentSession, /beforeunload/);
  assert.match(attachmentSession, /const itemId = item\?\.id/);
  assert.doesNotMatch(attachmentSession, /\[item, tripId, uploadSessionId\]/);
  assert.match(attachmentSession, /commitAttachmentUploadSession/);
  assert.match(attachmentSession, /discardAttachmentUploadSession/);
  assert.match(sessionRoute, /commit_item_asset_session_v1/);
  assert.match(sessionRoute, /discard_item_asset_session_v1/);
  assert.match(cleanup, /asset_cleanup_batch_v2/);
  assert.match(cleanup, /untracked_asset_storage_batch_v1/);
  assert.match(cleanup, /storage\.from\("trip-assets"\)\.remove/);
  assert.equal(
    formControls.every((source) => /ring-inset/.test(source) && /max-w-full/.test(source)),
    true,
  );
});
