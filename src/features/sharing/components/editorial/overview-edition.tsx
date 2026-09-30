"use client";

import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import { useI18n } from "@/features/i18n/i18n-provider";
import { editorialDaySections } from "../../editorial-presentation";
import type { PublicItinerary, PublicItineraryDay } from "../../types";
import { EditionCover } from "./edition-cover";
import { EditionDate, editionDayTitle } from "./edition-navigation";
import { DayPhoto } from "./day-photo";
import { DayTransport } from "./day-plans";

function OverviewDayCard({
  day,
  journal,
  onSelectDay,
}: {
  day: PublicItineraryDay;
  journal: boolean;
  onSelectDay: (ref: string) => void;
}) {
  const { t } = useI18n();
  const { plans, transport } = editorialDaySections(day);
  return (
    <article className="edition-overview-day-card" data-public-day-ref={day.ref}>
      <div className="edition-overview-day-copy">
        <div className="edition-overview-day-top">
          <span className="edition-overview-number">{String(day.dayNumber).padStart(2, "0")}</span>
          <div>
            <span className="edition-kicker">
              {t(journal ? "Chapter" : "Day {day}", { day: day.dayNumber })}
            </span>
            <EditionDate day={day} />
          </div>
        </div>
        <h3>{editionDayTitle(day, t("Day {day}", { day: day.dayNumber }))}</h3>
        <p className="edition-overview-stops">
          {plans.length
            ? plans.map((item, index) => (
                <span key={item.ref} data-public-item-ref={item.ref}>
                  {index ? " · " : ""}
                  {item.title}
                </span>
              ))
            : t("No shared plans for this day.")}
        </p>
        <button
          className="edition-overview-open"
          type="button"
          onClick={() => onSelectDay(day.ref)}
        >
          <span>
            {t("{count} plans", { count: plans.length })}
            {transport.length ? ` · ${t("{count} transfers", { count: transport.length })}` : ""}
          </span>
          <span>
            {t("Turn to this day")}
            <ArrowRight aria-hidden="true" />
          </span>
        </button>
      </div>
      {journal ? <DayPhoto day={day} /> : null}
    </article>
  );
}

export function OverviewEdition({
  itinerary,
  onSelectDay,
  onSelectItem,
  templateId,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (ref: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  templateId: "ethereal" | "journal";
}) {
  const { t } = useI18n();
  const journal = templateId === "journal";
  const planCount = itinerary.days.reduce(
    (sum, day) => sum + editorialDaySections(day).plans.length,
    0,
  );
  const transportDays = itinerary.days.filter((day) => editorialDaySections(day).transport.length);
  return (
    <section
      className={`itinerary-edition edition-overview edition-${templateId}`}
      aria-label={t("Whole trip overview")}
    >
      <EditionCover itinerary={itinerary} templateId={templateId} onSelectDay={onSelectDay} />
      {itinerary.citySequence.length ? (
        <div className="edition-city-stages">
          <MapPin aria-hidden="true" />
          {itinerary.citySequence.map((stage, index) => (
            <span key={`${stage.ref}:${index}`}>
              {index ? <ArrowRight aria-hidden="true" /> : null}
              {stage.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="edition-overview-heading">
        <h2>{t(journal ? "The chapters ahead" : "Whole trip overview")}</h2>
        <p>
          {t("{count} shared days", { count: itinerary.days.length })} ·{" "}
          {t("{count} plans", { count: planCount })}
        </p>
      </div>
      <div className="edition-overview-cards">
        {itinerary.days.map((day) => (
          <OverviewDayCard key={day.ref} day={day} journal={journal} onSelectDay={onSelectDay} />
        ))}
      </div>
      {itinerary.trip.dayCount > itinerary.days.length ? (
        <aside className="edition-partial-share">
          <CalendarDays aria-hidden="true" />
          <p>
            {t("Only {shared} of {planned} planned days are shared.", {
              shared: itinerary.days.length,
              planned: itinerary.trip.dayCount,
            })}
          </p>
        </aside>
      ) : null}
      {transportDays.length ? (
        <section className="edition-overview-transport">
          <h2 className="edition-kicker">{t("Journey transport")}</h2>
          {transportDays.map((day) => (
            <div key={day.ref}>
              <h3>{t("Day {day}", { day: day.dayNumber })}</h3>
              <DayTransport
                items={editorialDaySections(day).transport}
                onSelect={(ref) => onSelectItem(ref, day.ref)}
              />
            </div>
          ))}
        </section>
      ) : null}
    </section>
  );
}
