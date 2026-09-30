"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { EditionCover } from "./edition-cover";
import { EditionNavigation } from "./edition-navigation";
import type { PublicItinerary } from "../../types";
import { JournalDay } from "./journal-day";
import { EtherealDay } from "./ethereal-day";

export function ItineraryEdition({
  itinerary,
  onSelectDay,
  onSelectItem,
  selectedItemRef,
  selectedDayRef,
  templateId,
  overview = false,
  exporting = false,
  includeCover = true,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (ref: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedItemRef?: string;
  selectedDayRef?: string;
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
      <div
        className={`edition-book ${templateId === "ethereal" ? "edition-editorial-spread" : "edition-journal-book"}`}
      >
        {includeCover ? (
          <EditionCover
            itinerary={itinerary}
            templateId={templateId}
            onSelectDay={onSelectDay}
            timeline
            exporting={exporting}
          />
        ) : null}
        {templateId === "journal" && !exporting ? (
          <EditionNavigation
            days={itinerary.days}
            onSelectDay={onSelectDay}
            selectedDayRef={selectedDayRef}
            variant="rail"
          />
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
      </div>
    </section>
  );
}
