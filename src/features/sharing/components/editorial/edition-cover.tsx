"use client";

import { Route } from "lucide-react";
import { useI18n } from "@/features/i18n/i18n-provider";
import type { PublicItinerary } from "../../types";
import { JournalQuickOverview } from "./journal-quick-overview";
import { DayPhoto } from "./day-photo";
import { publicDateSummary } from "../public-trip-header";
import { editionCoverDay, editionTownKey, editionTowns } from "../../edition-destinations";

export function EditionCover({
  itinerary,
  templateId,
  timeline = false,
  exporting = false,
  onSelectDay,
}: {
  itinerary: PublicItinerary;
  templateId: "ethereal" | "journal";
  onSelectDay: (ref: string) => void;
  timeline?: boolean;
  exporting?: boolean;
}) {
  const { t, locale } = useI18n();
  const count = new Set(itinerary.days.map((day) => day.dayNumber)).size;
  const dates = publicDateSummary(itinerary, locale);
  const coverDay = editionCoverDay(itinerary);
  const town = coverDay ? editionTowns(coverDay)[0] : undefined;
  const cityPhotoSource = itinerary.days.find(
    (day) =>
      town &&
      coverDay &&
      editionTownKey(day) === editionTownKey(coverDay) &&
      day.cityPhotoSource?.name.trim().toLocaleLowerCase() === town.toLocaleLowerCase(),
  )?.cityPhotoSource;
  const photo =
    !exporting && coverDay ? (
      <DayPhoto
        day={{ ...coverDay, cityPhotoSource }}
        townOnly
        reserveSpace={templateId === "journal"}
      />
    ) : null;
  const title = (
    <div className="edition-cover-copy">
      <span className="edition-kicker">
        {t(
          templateId === "journal"
            ? "The little things, all in one place"
            : "A journey, beautifully kept",
        )}
      </span>
      {timeline && templateId === "ethereal" ? (
        <span className="edition-cover-count">
          {String(count).padStart(2, "0")}
          <small>{t("Shared days")}</small>
        </span>
      ) : null}
      <h2>{itinerary.trip.title}</h2>
      <p className="edition-cover-dates">
        {dates || t("Date TBD")} · {itinerary.variant.name}
      </p>
      {timeline && templateId === "ethereal" ? (
        <div className="edition-cover-signature">
          <span>{t("There we go")}</span>
          <Route aria-hidden="true" />
        </div>
      ) : null}
    </div>
  );
  if (templateId === "journal")
    return (
      <header className={`edition-front edition-journal-front ${timeline ? "is-timeline" : ""}`}>
        {title}
        {!timeline && !exporting ? (
          <div className="edition-journal-front-spread">
            {photo}
            <JournalQuickOverview itinerary={itinerary} onSelectDay={onSelectDay} />
            <div className="edition-journal-stamp" aria-label={t("{count} shared days", { count })}>
              <strong>{String(count).padStart(2, "0")}</strong>
              <span>{t("Shared pages")}</span>
            </div>
          </div>
        ) : null}
      </header>
    );
  return (
    <header className={`edition-front edition-ethereal-cover ${timeline ? "is-timeline" : ""}`}>
      {title}
      {timeline ? photo : null}
      {!timeline ? (
        <div className="edition-cover-visual">
          {photo}
          <div className="edition-journey-numeral" aria-hidden="true">
            {String(count).padStart(2, "0")}
            <span>{t("Shared days")}</span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
