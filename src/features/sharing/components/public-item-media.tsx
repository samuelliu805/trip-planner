"use client";

import Image from "next/image";
import { Eye, FileImage, FileText, Film, Play } from "lucide-react";
import { useState } from "react";

import {
  AttachmentViewer,
  type ViewerAttachment,
} from "@/features/attachments/components/attachment-viewer";

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

function GoogleImage({ media, prioritize }: { media: GoogleMedia; prioritize: boolean }) {
  return (
    <div className="media-thumb-v4">
      <Image
        alt={media.alt ?? "Itinerary place"}
        className="object-cover"
        fill
        fetchPriority={prioritize ? "high" : undefined}
        loading={prioritize ? "eager" : "lazy"}
        sizes="(max-width: 639px) calc(100vw - 3rem), (max-width: 1199px) 34vw, 24vw"
        src={media.thumbnailUrl ?? media.url}
        unoptimized
      />
    </div>
  );
}

function attachmentKindLabel(kind: AttachmentMedia["kind"]) {
  if (kind === "image") return "Photo";
  if (kind === "video") return "Video";
  return "PDF document";
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
  if (!attachments.length) return null;
  return (
    <div aria-label="Attachments" className={`public-attachment-grid ${variant}`} role="group">
      {attachments.map((attachment) => (
        <button
          aria-label={`Open attachment ${attachment.label}`}
          className="public-attachment-button"
          key={attachment.id}
          onClick={(event) => {
            event.stopPropagation();
            onOpen(attachment, event.currentTarget);
          }}
          type="button"
        >
          <AttachmentVisual attachment={attachment} />
          <span className="public-attachment-copy">
            <span className="public-attachment-name">{attachment.label}</span>
            <span className="public-attachment-meta">
              {attachmentKindLabel(attachment.kind)} · View
            </span>
          </span>
          <Eye aria-hidden="true" className="public-attachment-open-icon size-4" />
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
  const [viewerId, setViewerId] = useState<string>();
  const [viewerTrigger, setViewerTrigger] = useState<HTMLElement | null>(null);
  if (!media.length) return null;

  const attachmentMedia = media.filter(
    (entry): entry is AttachmentMedia => entry.source === "attachment",
  );
  const googleMedia = media.filter(
    (entry): entry is GoogleMedia => entry.source === "google_place",
  );
  const showGoogleMedia = variant === "overview" && googleMedia.length > 0;
  if (!showGoogleMedia && !attachmentMedia.length) return null;

  function openAttachment(attachment: AttachmentMedia, trigger: HTMLElement) {
    setViewerTrigger(trigger);
    setViewerId(attachment.id);
  }

  const rootClass = showGoogleMedia
    ? `public-item-media ${variant}${attachmentMedia.length ? " mixed-media" : ""}`
    : `public-item-attachments ${variant}`;

  return (
    <div className={rootClass}>
      {showGoogleMedia ? (
        <div className={`public-media-gallery media-grid-v4 count-1 google-place ${variant}`}>
          <div className="public-media-entry">
            <GoogleImage media={googleMedia[0]} prioritize={prioritizeFirst} />
          </div>
        </div>
      ) : null}
      <AttachmentButtons attachments={attachmentMedia} onOpen={openAttachment} variant={variant} />
      {showGoogleMedia ? (
        <div className="public-media-attribution">
          {googleMedia.map((entry) => (
            <span key={`${entry.id}:attribution`}>
              {entry.attribution ? (
                <>
                  Photo by{" "}
                  {entry.attribution.url ? (
                    <a
                      className="underline underline-offset-2 hover:text-foreground"
                      href={entry.attribution.url}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {entry.attribution.label}
                    </a>
                  ) : (
                    entry.attribution.label
                  )}
                  {" · "}
                </>
              ) : null}
              {entry.sourceUrl ? (
                <a
                  className="font-medium underline underline-offset-2 hover:text-foreground"
                  href={entry.sourceUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Google Maps
                </a>
              ) : (
                "Google Maps"
              )}
            </span>
          ))}
        </div>
      ) : null}
      <AttachmentViewer
        attachments={attachmentMedia.map(viewerAttachment)}
        initialId={viewerId}
        onOpenChange={(open) => !open && setViewerId(undefined)}
        open={Boolean(viewerId)}
        trigger={viewerTrigger}
      />
    </div>
  );
}
