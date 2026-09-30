"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { publicDayCityLabel } from "../../presentation";
import { meaningfulText } from "../../editorial-presentation";
import type { PublicItinerary } from "../../types";
import { JournalDay } from "./journal-day";
import { EtherealDay } from "./ethereal-day";

export function ItineraryEdition({
  itinerary,
  onSelectDay,
  onSelectItem,
  selectedItemRef,
  templateId,
  overview = false,
  exporting = false,
  includeCover = true,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (ref: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedItemRef?: string;
  templateId: "ethereal" | "journal";
  overview?: boolean;
  exporting?: boolean;
  includeCover?: boolean;
}) {
  const { t } = useI18n();
  const Day = templateId === "journal" ? JournalDay : EtherealDay;
  return (
    <section
      className={`itinerary-edition edition-${templateId} ${overview ? "edition-overview" : "edition-timeline"}`}
      aria-label={t(overview ? "Whole trip overview" : "Itinerary timeline")}
    >
      {includeCover ? (
        <div className="edition-front">
          <div className="edition-cover">
            <span className="edition-kicker">
              <T message={overview ? "Whole trip overview" : "Journey timeline"} />
            </span>
            <h2>{itinerary.trip.title}</h2>
            <p className="edition-cover-dates">
              {[itinerary.trip.startDate, itinerary.trip.endDate].filter(Boolean).join(" — ") ||
                t("Date TBD")}
            </p>
            <p className="edition-counts">
              {t("{count} planned days", { count: itinerary.trip.dayCount })} ·{" "}
              {t("{count} shared days", {
                count: new Set(itinerary.days.map((day) => day.dayNumber)).size,
              })}
            </p>
          </div>
          {!exporting && itinerary.days.length ? (
            <nav className="edition-contents" aria-label={t("Chapters")}>
              <h3 className="edition-kicker">
                <T message="Chapters" />
              </h3>
              {itinerary.days.map((day) => (
                <button type="button" key={day.ref} onClick={() => onSelectDay(day.ref)}>
                  <span>{String(day.dayNumber).padStart(2, "0")}</span>
                  <strong>
                    {meaningfulText(day.title) ??
                      meaningfulText(publicDayCityLabel(day)) ??
                      t("Day {day}", { day: day.dayNumber })}
                  </strong>
                  {day.date ? <time dateTime={day.date}>{day.date.slice(5)}</time> : null}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      ) : null}
      <div className="edition-chapters timeline-sections-v4">
        {itinerary.days.map((day, index) => (
          <Day
            day={day}
            key={`${day.ref}:${index}`}
            onSelectItem={onSelectItem}
            selectedItemRef={selectedItemRef}
            exporting={exporting}
          />
        ))}
        {!itinerary.days.length ? (
          <p className="edition-empty">
            <T message="No shared plans for this day." />
          </p>
        ) : null}
      </div>
    </section>
  );
}
