import Image from "next/image";
import { ExternalLink, FileText } from "lucide-react";

import type { PublicItemMedia } from "../types";

function MediaPreview({ media, prioritize }: { media: PublicItemMedia; prioritize: boolean }) {
  if (media.kind === "pdf")
    return (
      <a className="media-pdf-v4" href={media.url} rel="noopener noreferrer" target="_blank">
        <span className="pdf-icon-v4">
          <FileText aria-hidden="true" className="size-3" /> PDF
        </span>
        <span>{media.label}</span>
        <ExternalLink aria-hidden="true" className="size-3" />
      </a>
    );

  return (
    <div className="media-thumb-v4">
      <Image
        alt={media.alt ?? "Itinerary item image"}
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

export function PublicItemMediaGallery({
  media,
  prioritizeFirst = false,
  variant = "overview",
}: {
  media: PublicItemMedia[];
  prioritizeFirst?: boolean;
  variant?: "overview" | "timeline";
}) {
  if (!media.length) return null;
  const visible = media.slice(0, 3);
  const hiddenCount = media.length - visible.length;
  const googleMedia = media.filter(
    (entry): entry is Extract<PublicItemMedia, { kind: "image" }> =>
      entry.kind === "image" && entry.source === "google_place",
  );

  return (
    <div className={`public-item-media ${variant}`}>
      <div className={`public-media-gallery media-grid-v4 count-${visible.length} ${variant}`}>
        {visible.map((entry, index) => (
          <div className="public-media-entry" key={entry.id}>
            <MediaPreview media={entry} prioritize={prioritizeFirst && index === 0} />
            {hiddenCount && index === visible.length - 1 ? (
              <span className="media-more-v4">+{hiddenCount}</span>
            ) : null}
          </div>
        ))}
      </div>
      {googleMedia.length ? (
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
    </div>
  );
}
