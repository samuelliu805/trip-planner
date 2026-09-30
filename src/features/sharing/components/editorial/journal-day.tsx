"use client";

import { editorialDaySections } from "../../editorial-presentation";
import type { PublicItineraryDay } from "../../types";
import { DayHeading } from "./day-heading";
import { DayPlans, DayTransport, OptionalNote } from "./day-plans";
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
  const { plans, transport } = editorialDaySections(day);
  const onSelect = (ref: string) => onSelectItem(ref, day.ref);
  return (
    <article className="edition-day journal-page timeline-section-v4" data-public-day-ref={day.ref}>
      <DayHeading day={day} />
      <div className="journal-day-spread">
        {!exporting ? <DayPhoto day={day} /> : null}
        <div className={`journal-day-paper ${plans.length ? "has-plans" : ""}`}>
          <DayPlans
            items={plans}
            onSelect={onSelect}
            selectedItemRef={selectedItemRef}
            exporting={exporting}
          />
          <OptionalNote text={day.notes} exporting={exporting} />
        </div>
      </div>
      <DayTransport items={transport} onSelect={onSelect} exporting={exporting} />
    </article>
  );
}
