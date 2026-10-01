"use client";

import { Building2, Clock, MapPin, NotebookText } from "lucide-react";
import { useI18n } from "@/features/i18n/i18n-provider";
import { meaningfulText, publicItemAttachments } from "../editorial-presentation";
import { publicTransportShortLabel } from "../presentation";
import type { PublicItineraryItem } from "../types";
import { PublicItemIcon, publicItemTypeLabels } from "./public-item-icon";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicTransportDetails } from "./public-transport-details";
import { PublicInlineLinks } from "./public-inline-links";
import { isPublicTransfer } from "../presentation";
import { PublicQuickActions } from "./public-quick-actions";

export function PublicItemDetails({ item }: { item: PublicItineraryItem }) {
  const { t } = useI18n();
  const schedule =
    meaningfulText(item.scheduleLabel) ??
    [item.startTime?.slice(0, 5), item.endTime?.slice(0, 5)].filter(Boolean).join("–");
  const place = meaningfulText(item.place?.displayName);
  const address = meaningfulText(item.place?.address) ?? meaningfulText(item.carRental?.address);
  const showPlace = place && place !== item.title;
  const showAddress = address && address !== place && address !== item.title;
  const company = meaningfulText(item.carRental?.company);
  const notes = meaningfulText(item.notes);
  const transfer = isPublicTransfer(item);
  const category = item.flightEndpoint
    ? item.flightEndpoint.role === "departure"
      ? "Flight departure"
      : "Flight arrival"
    : item.type === "transport"
      ? publicTransportShortLabel(item)
      : publicItemTypeLabels[item.type];
  return (
    <article className="public-item-detail space-y-5 pb-3 text-sm">
      {!transfer ? (
        <div className="public-item-detail-field text-muted-foreground">
          <PublicItemIcon type={item.flightEndpoint ? "flight" : item.type} />
          <span>{t(category)}</span>
        </div>
      ) : null}
      {transfer ? <PublicTransportDetails item={item} /> : null}
      {!transfer && schedule ? (
        <div className="public-item-detail-field">
          <Clock aria-hidden="true" className="text-muted-foreground" />
          <p className="min-w-0 break-words font-medium">{schedule}</p>
        </div>
      ) : null}
      {showPlace || showAddress ? (
        <div className="public-item-detail-field">
          <MapPin aria-hidden="true" className="text-muted-foreground" />
          <div className="min-w-0 space-y-1 break-words">
            {showPlace ? <p className="font-medium">{place}</p> : null}
            {showAddress ? <p>{address}</p> : null}
          </div>
        </div>
      ) : null}
      {company && company !== item.title ? (
        <div className="public-item-detail-field">
          <Building2 aria-hidden="true" className="text-muted-foreground" />
          <p className="break-words">{company}</p>
        </div>
      ) : null}
      {notes ? (
        <div className="public-item-detail-field">
          <NotebookText aria-hidden="true" className="text-muted-foreground" />
          <p className="whitespace-pre-wrap break-words">{notes}</p>
        </div>
      ) : null}
      <PublicItemMediaGallery media={publicItemAttachments(item)} variant="table" />
      {transfer ? <PublicInlineLinks item={item} /> : <PublicQuickActions item={item} quiet />}
    </article>
  );
}
