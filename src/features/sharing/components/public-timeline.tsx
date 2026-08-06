import type { PublicItinerary } from "../types";
import { PublicTimelineDay } from "./public-timeline-day";

export function PublicTimeline({
  itinerary,
  onSelectDay,
  onSelectItem,
  selectedDayRef,
  selectedItemRef,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (dayRef: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedDayRef?: string;
  selectedItemRef?: string;
}) {
  return (
    <section aria-label="Itinerary timeline" className="public-timeline divide-y bg-muted/20">
      {itinerary.days.map((day) => (
        <PublicTimelineDay
          day={day}
          key={day.ref}
          onSelectDay={onSelectDay}
          onSelectItem={onSelectItem}
          selected={selectedDayRef === day.ref}
          selectedItemRef={selectedItemRef}
        />
      ))}
    </section>
  );
}
