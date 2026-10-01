"use client";

import { Localized, T, useI18n } from "@/features/i18n/i18n-provider";
import { meaningfulText, publicItemAttachments } from "../../editorial-presentation";
import { publicTransportShortLabel, publicTransportSupportingTitle } from "../../presentation";
import type { PublicItineraryItem } from "../../types";
import { PublicItemIcon, publicItemTypeLabels } from "../public-item-icon";
import { PublicItemMediaGallery } from "../public-item-media";
import { PublicTransportDetails } from "../public-transport-details";
import { PublicInlineLinks } from "../public-inline-links";
import { PublicQuickActions } from "../public-quick-actions";

export function OptionalNote({ text, exporting = false }: { text?: string; exporting?: boolean }) {
  const { t } = useI18n();
  const note = meaningfulText(text);
  if (!note) return null;
  return exporting || note.length < 240 ? (
    <p className="edition-note">{note}</p>
  ) : (
    <details className="edition-note">
      <summary>{t("Notes")}</summary>
      <p>{note}</p>
    </details>
  );
}

export function DayPlans({
  items,
  onSelect,
  selectedItemRef,
  exporting = false,
}: {
  items: PublicItineraryItem[];
  onSelect: (ref: string) => void;
  selectedItemRef?: string;
  exporting?: boolean;
}) {
  const { t } = useI18n();
  if (!items.length)
    return (
      <p className="edition-empty">
        <T message="No shared plans for this day." />
      </p>
    );
  return (
    <section className="edition-plans">
      <h4 className="edition-kicker">
        <T message="THE DAY" />
      </h4>
      <ol className="edition-plan-list">
        {items.map((item, index) => {
          const category = item.flightEndpoint
            ? item.flightEndpoint.role === "departure"
              ? "Flight departure"
              : "Flight arrival"
            : publicItemTypeLabels[item.type];
          const title = meaningfulText(item.title) ?? t(category);
          const schedule =
            meaningfulText(item.scheduleLabel) ??
            [item.startTime?.slice(0, 5), item.endTime?.slice(0, 5)].filter(Boolean).join("–");
          const place = meaningfulText(item.place?.displayName);
          const rental = [item.carRental?.company, item.carRental?.address]
            .filter((value) => meaningfulText(value))
            .join(" · ");
          return (
            <li
              className={`edition-plan ${selectedItemRef === item.ref ? "is-selected" : ""}`}
              key={item.ref}
            >
              <span className="edition-plan-order" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="edition-plan-body">
                <button
                  className="edition-plan-button"
                  data-public-item-ref={item.ref}
                  onClick={() => onSelect(item.ref)}
                  type="button"
                >
                  <span className="edition-plan-category">
                    <PublicItemIcon type={item.flightEndpoint ? "flight" : item.type} />
                    <Localized value={category} />
                  </span>
                  <strong>{item.type === "car_rental" ? t(title) : title}</strong>
                  {schedule || (place && place !== title) ? (
                    <span className="edition-plan-meta">
                      {[schedule, place !== title ? place : undefined].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </button>
                {rental ? <p className="edition-plan-meta">{rental}</p> : null}
                <OptionalNote text={item.notes} exporting={exporting} />
                {exporting ? (
                  publicItemAttachments(item).length ? (
                    <p className="edition-attachment-names">
                      {publicItemAttachments(item)
                        .map((entry) => entry.label)
                        .join(" · ")}
                    </p>
                  ) : null
                ) : (
                  <PublicItemMediaGallery media={publicItemAttachments(item)} variant="timeline" />
                )}
                {!exporting ? <PublicQuickActions item={item} quiet /> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function DayTransport({
  items,
  onSelect,
  exporting = false,
}: {
  items: PublicItineraryItem[];
  onSelect: (ref: string) => void;
  exporting?: boolean;
}) {
  const { t } = useI18n();
  if (!items.length) return null;
  return (
    <section className="edition-transport" aria-label={t("Transport")}>
      {items.map((item) => (
        <div key={item.ref} className="edition-transfer">
          <button
            className="edition-transfer-button"
            data-public-item-ref={item.ref}
            onClick={() => onSelect(item.ref)}
            type="button"
          >
            <PublicItemIcon type={item.type} />
            <span className="edition-transfer-content">
              <span className="edition-transfer-headline">
                <strong>{t(publicTransportShortLabel(item))}</strong>
                {publicTransportSupportingTitle(item) ? (
                  <span>{publicTransportSupportingTitle(item)}</span>
                ) : null}
              </span>
              <PublicTransportDetails item={item} />
            </span>
          </button>
          <OptionalNote text={item.notes} exporting={exporting} />
          {exporting ? (
            publicItemAttachments(item).length ? (
              <p className="edition-attachment-names">
                {publicItemAttachments(item)
                  .map((entry) => entry.label)
                  .join(" · ")}
              </p>
            ) : null
          ) : (
            <>
              <PublicItemMediaGallery media={publicItemAttachments(item)} variant="transport" />
              <PublicInlineLinks item={item} />
            </>
          )}
        </div>
      ))}
    </section>
  );
}
