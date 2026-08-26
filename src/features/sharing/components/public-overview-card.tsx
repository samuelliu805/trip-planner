"use client";

import { Localized, useI18n } from "@/features/i18n/i18n-provider";

import type { PublicOverviewItemPresentation } from "../public-overview-presentation";
import { PublicItemIcon, publicItemTypeLabels } from "./public-item-icon";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicQuickActions } from "./public-quick-actions";

export function PublicOverviewCard({
  onSelect,
  order,
  presentation,
  prioritizeMedia,
  selected,
}: {
  onSelect: () => void;
  order: number;
  presentation: PublicOverviewItemPresentation;
  prioritizeMedia: boolean;
  selected: boolean;
}) {
  const { t } = useI18n();
  const { item, media } = presentation;
  const schedule = item.startTime?.slice(0, 5) ?? item.scheduleLabel;
  const place = item.place?.localityName ?? item.place?.displayName;
  const placeMedia = media.filter(({ source }) => source === "google_place");
  const attachments = media.filter(({ source }) => source === "attachment");
  const hasVisualMedia = placeMedia.length > 0;

  const spanClass = hasVisualMedia
    ? "span-featured"
    : item.type === "activity"
      ? "span-activity"
      : "span-compact";
  const typeClass = item.type === "car_rental" ? "rental" : item.type;

  return (
    <article
      className={`public-overview-card overview-item-card-v4 ${spanClass} ${typeClass} ${hasVisualMedia ? "has-media" : "no-media"} ${selected ? "is-selected" : ""}`}
    >
      <button
        aria-current={selected ? "true" : undefined}
        aria-label={t("Focus map on {item}", { item: item.title })}
        className="public-item-focus overview-item-top-v4"
        data-public-item-ref={item.ref}
        onClick={onSelect}
        type="button"
      >
        <span
          className="overview-item-icon-v4"
          data-public-item-category={t(publicItemTypeLabels[item.type])}
        >
          <PublicItemIcon className="size-3.5" type={item.type} />
        </span>
        <span className="overview-item-copy-v4">
          <span className="overview-item-title-v4">{item.title}</span>
          {schedule || place ? (
            <span className="overview-item-meta-v4">
              {[schedule, place].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="overview-order-v4">{String(order).padStart(2, "0")}</span>
      </button>

      <PublicItemMediaGallery media={attachments} variant="overview" />
      <PublicItemMediaGallery
        media={placeMedia}
        prioritizeFirst={prioritizeMedia}
        variant="overview"
      />

      {item.notes ? (
        <button className="overview-item-notes-v4" onClick={onSelect} type="button">
          <span className="line-clamp-3 whitespace-pre-wrap">{item.notes}</span>
        </button>
      ) : null}
      <footer className="overview-item-footer-v4">
        <span>
          <Localized value={publicItemTypeLabels[item.type]} />
        </span>
        <PublicQuickActions item={item} quiet />
      </footer>
    </article>
  );
}
