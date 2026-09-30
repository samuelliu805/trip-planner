"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import Image from "next/image";
import { FileImage, FileText, Film, Play } from "lucide-react";
import { useContext, useState } from "react";
import { PublicMediaExportContext } from "./public-media-export-context";

import {
  AttachmentViewer,
  preloadAttachmentPdfViewer,
  type ViewerAttachment,
} from "@/features/attachments/components/attachment-viewer";

import { usePublicPlacePhoto } from "./public-photo-provider";
import type { LoadedPlacePhoto } from "../public-photo-session";

import type { PublicItemMedia } from "../types";

type AttachmentMedia = Extract<PublicItemMedia, { source: "attachment" }>;
type GoogleMedia = Extract<PublicItemMedia, { source: "google_place" }>;

function viewerAttachment(media: AttachmentMedia): ViewerAttachment {
  return {
    byteSize: media.byteSize,
    fileName: media.label,
    id: media.id,
    kind: media.kind,
    mimeType: media.mimeType,
    thumbnailUrl: media.thumbnailUrl,
    url: media.url,
  };
}

function GoogleImage({
  media,
  photo,
  prioritize,
}: {
  media: GoogleMedia;
  photo: LoadedPlacePhoto;
  prioritize: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="media-thumb-v4">
      {photo ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- session resource, no image processing. */}
          <img
            alt={media.alt ?? t("Itinerary place")}
            style={{ width: "100%", height: "auto" }}
            src={photo.displayUrl}
            fetchPriority={prioritize ? "high" : undefined}
          />
          <span className="public-media-attribution">
            {(
              photo.media.attributions ?? (photo.media.attribution ? [photo.media.attribution] : [])
            ).map((author, index) => (
              <span key={`${author.label}:${index}`}>
                <T message="Photo by" />{" "}
                {author.url ? (
                  <a href={author.url} target="_blank" rel="noopener noreferrer">
                    {author.label}
                  </a>
                ) : (
                  author.label
                )}{" "}
                ·{" "}
              </span>
            ))}
            {photo.media.sourceUrl ? (
              <a href={photo.media.sourceUrl}>
                <T message="Google Maps" />
              </a>
            ) : (
              <T message="Google Maps" />
            )}
          </span>
        </>
      ) : null}
    </div>
  );
}

function attachmentKindLabel(kind: AttachmentMedia["kind"]) {
  if (kind === "image") return "Image";
  if (kind === "video") return "Video";
  return "PDF";
}

function AttachmentVisual({ attachment }: { attachment: AttachmentMedia }) {
  if (attachment.thumbnailUrl) {
    return (
      <span className="public-attachment-visual has-thumbnail">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="56px"
          src={attachment.thumbnailUrl}
          unoptimized
        />
        {attachment.kind === "video" ? (
          <span className="public-attachment-play">
            <Play aria-hidden="true" className="size-3.5 fill-current" />
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className={`public-attachment-visual is-${attachment.kind}`}>
      {attachment.kind === "pdf" ? (
        <FileText aria-hidden="true" className="size-5" />
      ) : attachment.kind === "video" ? (
        <Film aria-hidden="true" className="size-5" />
      ) : (
        <FileImage aria-hidden="true" className="size-5" />
      )}
    </span>
  );
}

function AttachmentButtons({
  attachments,
  onOpen,
  variant,
}: {
  attachments: AttachmentMedia[];
  onOpen: (attachment: AttachmentMedia, trigger: HTMLButtonElement) => void;
  variant: "overview" | "table" | "timeline" | "transport";
}) {
  const { t } = useI18n();
  if (!attachments.length) return null;
  return (
    <div
      aria-label="Attachments"
      data-i18n-aria-label={"Attachments"}
      className={`public-attachment-grid ${variant}`}
      role="group"
    >
      {attachments.map((attachment) => (
        <button
          aria-label={t("Open attachment {file}", { file: attachment.label })}
          className="public-attachment-button"
          key={attachment.id}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(attachment, event.currentTarget);
          }}
          onFocus={attachment.kind === "pdf" ? preloadAttachmentPdfViewer : undefined}
          onPointerDown={attachment.kind === "pdf" ? preloadAttachmentPdfViewer : undefined}
          onPointerEnter={attachment.kind === "pdf" ? preloadAttachmentPdfViewer : undefined}
          type="button"
        >
          <AttachmentVisual attachment={attachment} />
          <span className="public-attachment-copy">
            <span className="public-attachment-name">{attachment.label}</span>
            <span className="public-attachment-meta">{attachmentKindLabel(attachment.kind)}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function PublicItemMediaGallery({
  media,
  prioritizeFirst = false,
  variant = "overview",
}: {
  media: PublicItemMedia[];
  prioritizeFirst?: boolean;
  variant?: "overview" | "table" | "timeline" | "transport";
}) {
  const exporting = useContext(PublicMediaExportContext);
  const [viewerId, setViewerId] = useState<string>();
  const [viewerTrigger, setViewerTrigger] = useState<HTMLElement | null>(null);

  const attachmentMedia = media.filter(
    (entry): entry is AttachmentMedia => entry.source === "attachment",
  );
  const googleMedia = media.filter(
    (entry): entry is GoogleMedia => entry.source === "google_place",
  );
  const observeGoogle =
    !exporting &&
    process.env.NEXT_PUBLIC_APP_REGION !== "cn" &&
    variant === "overview" &&
    googleMedia.length > 0;
  const { observerRef, photo } = usePublicPlacePhoto(
    observeGoogle ? googleMedia[0].id.replace(/^google-place:/, "") : undefined,
  );
  const showGoogleMedia = observeGoogle && Boolean(photo);
  if (!media.length) return null;
  if (!showGoogleMedia && !attachmentMedia.length)
    return observeGoogle ? (
      <div
        aria-hidden="true"
        ref={observerRef}
        style={{ position: "absolute", width: 1, height: 1, pointerEvents: "none" }}
      />
    ) : null;

  if (exporting)
    return attachmentMedia.length ? (
      <p className="edition-attachment-names">
        {attachmentMedia.map((entry) => entry.label).join(" · ")}
      </p>
    ) : null;

  function openAttachment(attachment: AttachmentMedia, trigger: HTMLElement) {
    setViewerTrigger(trigger);
    setViewerId(attachment.id);
  }

  const rootClass = showGoogleMedia
    ? `public-item-media ${variant}`
    : `public-item-attachments ${variant}`;

  return (
    <div className={rootClass}>
      {observeGoogle ? (
        <div
          aria-hidden="true"
          ref={observerRef}
          style={{ position: "absolute", width: 1, height: 1, pointerEvents: "none" }}
        />
      ) : null}
      {showGoogleMedia ? (
        <div className={`public-media-gallery media-grid-v4 count-1 google-place ${variant}`}>
          <div className="public-media-entry">
            <GoogleImage media={googleMedia[0]} photo={photo!} prioritize={prioritizeFirst} />
          </div>
        </div>
      ) : null}
      <AttachmentButtons attachments={attachmentMedia} onOpen={openAttachment} variant={variant} />
      {attachmentMedia.length ? (
        <AttachmentViewer
          attachments={attachmentMedia.map(viewerAttachment)}
          initialId={viewerId}
          onOpenChange={(open) => !open && setViewerId(undefined)}
          open={Boolean(viewerId)}
          trigger={viewerTrigger}
        />
      ) : null}
    </div>
  );
}
