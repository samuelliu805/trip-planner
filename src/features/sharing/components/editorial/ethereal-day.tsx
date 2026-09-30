"use client";

import { editorialDaySections } from "../../editorial-presentation";
import { DayHeading } from "./day-heading";
import { DayPlans, DayTransport, OptionalNote } from "./day-plans";
import type { EditorialDayProps } from "./journal-day";

export function EtherealDay({
  day,
  onSelectItem,
  selectedItemRef,
  exporting = false,
}: EditorialDayProps) {
  const { plans, transport } = editorialDaySections(day);
  const onSelect = (ref: string) => onSelectItem(ref, day.ref);
  return (
    <article
      className="edition-day ethereal-chapter timeline-section-v4"
      data-public-day-ref={day.ref}
    >
      <div className="ethereal-chapter-lead">
        <DayHeading day={day} />
        <OptionalNote text={day.notes} exporting={exporting} />
      </div>
      <div className="ethereal-chapter-flow">
        <DayPlans
          items={plans}
          onSelect={onSelect}
          selectedItemRef={selectedItemRef}
          exporting={exporting}
        />
        <DayTransport items={transport} onSelect={onSelect} exporting={exporting} />
      </div>
    </article>
  );
}
