"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import type { PublicItineraryDay } from "../../types";
import { publicGoogleCoverItem } from "../../public-media-presentation";
import { usePublicPlacePhoto } from "../public-photo-provider";

export function DayPhoto({
  day,
  townOnly = false,
}: {
  day: PublicItineraryDay;
  townOnly?: boolean;
}) {
  const { t } = useI18n();
  const item = townOnly ? undefined : publicGoogleCoverItem(day);
  const source = townOnly ? day.cityPhotoSource : day.photoSource;
  const { observerRef, photo } = usePublicPlacePhoto(source?.ref ?? item?.ref);
  return (
    <div ref={observerRef} className={photo ? "edition-photo-slot" : "edition-photo-observer"}>
      {photo ? (
        <figure className="edition-photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- preserve provider pixels and natural aspect ratio. */}
          <img
            alt={photo.media.alt ?? source?.name ?? item?.title ?? t("Itinerary place")}
            src={photo.displayUrl}
          />
          <figcaption>
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
              <a href={photo.media.sourceUrl} target="_blank" rel="noopener noreferrer">
                <T message="Google Maps" />
              </a>
            ) : (
              <T message="Google Maps" />
            )}
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}
