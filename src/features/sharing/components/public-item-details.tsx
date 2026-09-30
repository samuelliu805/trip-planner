"use client";

import { Clock, MapPin, Route, Ticket } from "lucide-react";
import { useI18n } from "@/features/i18n/i18n-provider";
import { meaningfulText, publicItemAttachments } from "../editorial-presentation";
import { publicTransportShortLabel } from "../presentation";
import type { PublicItineraryItem } from "../types";
import { PublicItemIcon, publicItemTypeLabels } from "./public-item-icon";
import { PublicItemMediaGallery } from "./public-item-media";
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
  const origin = meaningfulText(item.transport?.origin);
  const destination = meaningfulText(item.transport?.destination);
  const service = meaningfulText(item.transport?.serviceNumber);
  const category = item.flightEndpoint
    ? item.flightEndpoint.role === "departure"
      ? "Flight departure"
      : "Flight arrival"
    : item.type === "transport"
      ? publicTransportShortLabel(item)
      : publicItemTypeLabels[item.type];
  return (
    <article className="public-item-detail space-y-5 pb-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <PublicItemIcon type={item.flightEndpoint ? "flight" : item.type} />
        <span>{t(category)}</span>
      </div>
      {schedule ? (
        <div className="flex items-start gap-3">
          <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 break-words font-medium">{schedule}</p>
        </div>
      ) : null}
      {origin || destination ? (
        <div className="flex items-start gap-3">
          <Route aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1 break-words">
            {origin ? (
              <p>
                <span className="mr-2 text-muted-foreground">{t("From")}</span>
                {origin}
              </p>
            ) : null}
            {destination ? (
              <p>
                <span className="mr-2 text-muted-foreground">{t("To")}</span>
                {destination}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
      {service ? (
        <div className="flex items-start gap-3">
          <Ticket aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="min-w-0 break-words">{service}</p>
        </div>
      ) : null}
      {showPlace || showAddress ? (
        <div className="flex items-start gap-3">
          <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1 break-words">
            {showPlace ? <p className="font-medium">{place}</p> : null}
            {showAddress ? <p>{address}</p> : null}
          </div>
        </div>
      ) : null}
      {company && company !== item.title ? <p className="break-words">{company}</p> : null}
      {notes ? <p className="whitespace-pre-wrap break-words leading-relaxed">{notes}</p> : null}
      <PublicItemMediaGallery media={publicItemAttachments(item)} variant="table" />
      <PublicQuickActions item={item} quiet />
    </article>
  );
}
