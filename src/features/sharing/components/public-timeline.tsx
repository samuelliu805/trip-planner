import { T } from "@/features/i18n/i18n-provider";
import type { PublicItinerary } from "../types";
import { PublicTimelineDay } from "./public-timeline-day";

export function PublicTimeline({
  itinerary,
  onSelectDay,
  onSelectItem,
  selectedDayRef,
  selectedItemRef,
  showIntro = true,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (dayRef: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedDayRef?: string;
  selectedItemRef?: string;
  showIntro?: boolean;
}) {
  return (
    <section
      aria-label="Itinerary timeline"
      data-i18n-aria-label={"Itinerary timeline"}
      className="public-timeline timeline-v4"
    >
      {showIntro ? (
        <div className="timeline-intro-v4">
          <div>
            <div className="public-section-label">
              <T message={"Journey timeline"} />
            </div>
            <p className="timeline-intro-copy-v4">
              <T message={" Manual order, actual times, and major travel context. "} />
            </p>
          </div>
        </div>
      ) : null}
      <div className="timeline-sections-v4">
        {itinerary.days.map((day) => {
          return (
            <PublicTimelineDay
              day={day}
              key={day.ref}
              onSelectDay={onSelectDay}
              onSelectItem={onSelectItem}
              selected={selectedDayRef === day.ref}
              selectedItemRef={selectedItemRef}
            />
          );
        })}
      </div>
    </section>
  );
}
