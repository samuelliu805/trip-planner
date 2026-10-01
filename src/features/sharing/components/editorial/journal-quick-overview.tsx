"use client";

import { useI18n } from "@/features/i18n/i18n-provider";
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
  const days = itinerary.days;
  const indexes =
    days.length <= 3
      ? days.map((_, index) => index)
      : [0, Math.floor((days.length - 1) / 2), days.length - 1];
  return (
    <nav className="journal-quick-overview" aria-label={t("Whole trip overview")}>
      <span className="journal-contents-tab">{t("Overview")}</span>
      <h3 className="edition-kicker">{t("The chapters ahead")}</h3>
      <ol>
        {indexes.map((index, position) => {
          const day = days[index];
          const next = indexes[position + 1];
          return (
            <li key={day.ref}>
              <button type="button" onClick={() => onSelectDay(day.ref)}>
                <span className="journal-contents-number" aria-hidden="true">
                  {String(day.dayNumber).padStart(2, "0")}
                </span>
                <span className="journal-contents-chapter">
                  <span className="edition-kicker">{t("Day {day}", { day: day.dayNumber })}</span>
                  <strong>{editionDayTitle(day, t("Day {day}", { day: day.dayNumber }))}</strong>
                  <EditionDate day={day} />
                </span>
              </button>
              {next !== undefined && next - index > 1 ? (
                <div className="journal-contents-continuation" aria-hidden="true">
                  <svg viewBox="0 0 120 20" focusable="false">
                    <path d="M2 8 Q28 24 60 10 T118 9" />
                  </svg>
                  <span>…</span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div
        className="edition-journal-stamp"
        aria-label={t("{count} shared days", { count: days.length })}
      >
        <strong>{String(days.length).padStart(2, "0")}</strong>
        <span>{t("Shared pages")}</span>
      </div>
    </nav>
  );
}
