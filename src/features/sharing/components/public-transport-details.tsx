"use client";

import { Clock, Ticket } from "lucide-react";
import { useI18n } from "@/features/i18n/i18n-provider";
import { meaningfulText } from "../editorial-presentation";
import type { PublicItineraryItem } from "../types";

/** Supporting transport details share one layout in the chapter and detail sheet. */
export function PublicTransportDetails({ item }: { item: PublicItineraryItem }) {
  const { t } = useI18n();
  const origin = meaningfulText(item.transport?.origin);
  const destination = meaningfulText(item.transport?.destination);
  const service = meaningfulText(item.transport?.serviceNumber);
  const schedule =
    meaningfulText(item.scheduleLabel) ??
    [item.startTime?.slice(0, 5), item.endTime?.slice(0, 5)].filter(Boolean).join("–");
  return (
    <span className="public-transport-details">
      {origin || destination ? (
        <span className="public-transport-route">
          {origin ? (
            <span>
              <span>{t("From")}</span>
              <span>{origin}</span>
            </span>
          ) : null}
          {destination ? (
            <span>
              <span>{t("To")}</span>
              <span>{destination}</span>
            </span>
          ) : null}
        </span>
      ) : null}
      {schedule || service ? (
        <span className="public-transport-facts">
          {schedule ? (
            <span>
              <Clock aria-hidden="true" />
              {schedule}
            </span>
          ) : null}
          {service ? (
            <span>
              <Ticket aria-hidden="true" />
              {service}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
