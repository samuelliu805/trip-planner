"use client";

import { useLayoutEffect } from "react";
import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PublicItineraryDay } from "../../types";
import { publicGoogleCoverItem } from "../../public-media-presentation";
import { usePublicPlacePhoto } from "../public-photo-provider";

export function DayPhoto({
  day,
  townOnly = false,
  backdrop = false,
  reserveSpace = false,
}: {
  day: PublicItineraryDay;
  townOnly?: boolean;
  backdrop?: boolean;
  reserveSpace?: boolean;
}) {
  const { t } = useI18n();
  const item = townOnly ? undefined : publicGoogleCoverItem(day);
  const source = townOnly ? day.cityPhotoSource : day.photoSource;
  const { observerRef, photo, canLoad, failed } = usePublicPlacePhoto(source?.ref ?? item?.ref);
  const reserved = reserveSpace && canLoad;
  useLayoutEffect(() => {
    if (!photo) return;
    // The decoded image has just entered the DOM. Let a continuous reader
    // restore its explicit chapter anchor before this commit can be painted.
    observerRef.current?.dispatchEvent(new Event("public-photo-ready", { bubbles: true }));
  }, [observerRef, photo]);
  const image = photo ? (
    // eslint-disable-next-line @next/next/no-img-element -- reuse the decoded provider photo.
    <img
      alt={photo.media.alt ?? source?.name ?? item?.title ?? t("Itinerary place")}
      src={photo.displayUrl}
    />
  ) : (
    <div className="edition-photo-placeholder" aria-hidden="true" />
  );
  return (
    <div
      ref={observerRef}
      className={
        photo || reserved
          ? `edition-photo-slot${backdrop ? " edition-photo-backdrop" : ""}${reserved ? " edition-photo-reserved" : ""}`
          : "edition-photo-observer"
      }
      data-photo-state={photo ? "ready" : failed ? "unavailable" : "pending"}
    >
      {photo || reserved ? (
        <figure className="edition-photo">
          {reserved ? <div className="edition-photo-frame">{image}</div> : image}
          <figcaption>
            {(
              photo?.media.attributions ??
              (photo?.media.attribution ? [photo.media.attribution] : [])
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
            {photo?.media.sourceUrl ? (
              <a href={photo.media.sourceUrl} target="_blank" rel="noopener noreferrer">
                <T message="Google Maps" />
              </a>
            ) : photo ? (
              <T message="Google Maps" />
            ) : null}
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
