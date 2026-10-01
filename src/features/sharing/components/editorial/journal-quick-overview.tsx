"use client";

import { useI18n } from "@/features/i18n/i18n-provider";
import type { PublicItinerary } from "../../types";
import { EditionDate, editionDayTitle } from "./edition-navigation";
import { journalPreviewIndexes } from "../../journal-chapters";

function ChapterContinuation() {
  return (
    <div className="journal-contents-continuation" aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}

export function JournalQuickOverview({
  itinerary,
  onSelectDay,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (ref: string) => void;
}) {
  const { t } = useI18n();
  const days = itinerary.days;
  const indexes = journalPreviewIndexes(days);
  return (
    <nav className="journal-quick-overview" aria-label={t("Whole trip overview")}>
      <span className="journal-contents-tab">{t("Overview")}</span>
      <h3 className="edition-kicker">{t("The chapters ahead")}</h3>
      {indexes[0] > 0 ? <ChapterContinuation /> : null}
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
              {next !== undefined && next - index > 1 ? <ChapterContinuation /> : null}
            </li>
          );
        })}
      </ol>
      {indexes.at(-1)! < days.length - 1 ? <ChapterContinuation /> : null}
    </nav>
  );
}
