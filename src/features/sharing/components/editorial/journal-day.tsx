"use client";

import { editorialDaySections } from "../../editorial-presentation";
import type { PublicItineraryDay } from "../../types";
import { PublicDayNotes } from "../public-day-notes";
import { DayHeading } from "./day-heading";
import { DayPlans, DayTransport } from "./day-plans";
import { DayPhoto } from "./day-photo";

export type EditorialDayProps = {
  day: PublicItineraryDay;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedItemRef?: string;
  exporting?: boolean;
};

export function JournalDay({
  day,
  onSelectItem,
  selectedItemRef,
  exporting = false,
}: EditorialDayProps) {
  const { notes, plans, transport } = editorialDaySections(day);
  const onSelect = (ref: string) => onSelectItem(ref, day.ref);
  return (
    <article className="edition-day journal-page timeline-section-v4" data-public-day-ref={day.ref}>
      <DayHeading day={day} />
      <div className="journal-day-spread">
        {!exporting ? <DayPhoto day={day} reserveSpace /> : null}
        <div className={`journal-day-paper ${plans.length ? "has-plans" : ""}`}>
          <DayPlans
            items={plans}
            onSelect={onSelect}
            selectedItemRef={selectedItemRef}
            exporting={exporting}
          />
        </div>
      </div>
      <DayTransport items={transport} onSelect={onSelect} exporting={exporting} />
      <PublicDayNotes
        dayNotes={day.notes}
        exporting={exporting}
        notes={notes}
        onSelect={onSelect}
        selectedItemRef={selectedItemRef}
      />
    </article>
  );
}
