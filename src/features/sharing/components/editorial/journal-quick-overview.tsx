"use client";

import { useI18n } from "@/features/i18n/i18n-provider";
import { editorialDaySections } from "../../editorial-presentation";
import type { PublicItinerary } from "../../types";
import { EditionDate, editionDayTitle } from "./edition-navigation";

export function JournalQuickOverview({
  itinerary,
  onSelectDay,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (ref: string) => void;
}) {
  const { t } = useI18n();
  return (
    <nav className="journal-quick-overview" aria-label={t("Whole trip overview")}>
      <h3 className="edition-kicker">{t("The chapters ahead")}</h3>
      <ol>
        {itinerary.days.map((day) => (
          <li key={day.ref}>
            <button type="button" onClick={() => onSelectDay(day.ref)}>
              <span className="edition-kicker">{t("Day {day}", { day: day.dayNumber })}</span>
              <strong>{editionDayTitle(day, t("Day {day}", { day: day.dayNumber }))}</strong>
              <EditionDate day={day} />
              <span>{t("{count} plans", { count: editorialDaySections(day).plans.length })}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
