"use client";

import Image from "next/image";
import { FileText, Paperclip, Play } from "lucide-react";
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

function AttachmentPreview({ media }: { media: AttachmentMedia }) {
  if (media.kind === "pdf")
    return (
      <span className="media-pdf-v4">
        <span className="pdf-icon-v4">
          <FileText aria-hidden="true" className="size-3" /> PDF
        </span>
        <span className="line-clamp-2 break-words">{media.label}</span>
      </span>
    );

  return (
    <span className="media-thumb-v4">
      {media.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- access uses short-lived signed redirects.
        <img
          alt={media.kind === "image" ? (media.alt ?? media.label) : ""}
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          src={media.thumbnailUrl}
        />
      ) : null}
      {media.kind === "video" ? (
        <span className="media-video-icon-v4">
          <Play aria-hidden="true" className="size-4 fill-current" />
        </span>
      ) : null}
    </span>
  );
}

function CompactAttachments({
  attachments,
  onOpen,
}: {
  attachments: AttachmentMedia[];
  onOpen: (attachment: AttachmentMedia, trigger: HTMLButtonElement) => void;
}) {
  if (!attachments.length) return null;
  const first = attachments[0];
  return (
    <button
      aria-label={
        attachments.length === 1
          ? `Open attachment ${first.label}`
          : `Open ${attachments.length} attachments`
      }
      className="public-attachment-chip"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(first, event.currentTarget);
      }}
      type="button"
    >
      <Paperclip aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">
        {attachments.length === 1 ? first.label : `${attachments.length} attachments`}
      </span>
    </button>
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
  const visibleAttachments = attachmentMedia.slice(0, 3);
  const hiddenAttachmentCount = attachmentMedia.length - visibleAttachments.length;
  const compactAttachments = variant !== "overview" || googleMedia.length > 0;
  const showGoogleMedia = variant === "overview" && googleMedia.length > 0;
  if (!showGoogleMedia && !attachmentMedia.length) return null;

  function openAttachment(attachment: AttachmentMedia, trigger: HTMLElement) {
    setViewerTrigger(trigger);
    setViewerId(attachment.id);
  }

  return (
    <div className={`public-item-media ${variant}`}>
      {showGoogleMedia ? (
        <div className={`public-media-gallery media-grid-v4 count-1 google-place ${variant}`}>
          <div className="public-media-entry">
            <GoogleImage media={googleMedia[0]} prioritize={prioritizeFirst} />
          </div>
        </div>
      ) : null}
      {compactAttachments ? (
        <CompactAttachments attachments={attachmentMedia} onOpen={openAttachment} />
      ) : visibleAttachments.length ? (
        <div
          className={`public-media-gallery media-grid-v4 count-${visibleAttachments.length} attachments ${variant}`}
        >
          {visibleAttachments.map((entry, index) => (
            <div className="public-media-entry" key={entry.id}>
              <button
                aria-label={`Open ${entry.label}`}
                className="media-preview-button-v4"
                onClick={(event) => {
                  event.stopPropagation();
                  openAttachment(entry, event.currentTarget);
                }}
                type="button"
              >
                <AttachmentPreview media={entry} />
              </button>
              {hiddenAttachmentCount > 0 && index === visibleAttachments.length - 1 ? (
                <span className="media-more-v4">+{hiddenAttachmentCount}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
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
