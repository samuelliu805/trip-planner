import { format, parseISO } from "date-fns";

import { publicDayCityLabel } from "../presentation";
import { publicOverviewDayLayout } from "../public-overview-presentation";
import type { PublicItinerary } from "../types";
import { PublicOverviewCard } from "./public-overview-card";

export function PublicOverview({
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
    <section aria-label="Whole trip overview" className="public-overview overview-v4">
      <div className="overview-title-row-v4">
        <div>
          <div className="public-section-label">Whole trip overview</div>
          <p className="overview-subtitle-v4">
            Media-aware board. Shared place imagery and attachments receive visual weight while
            manual itinerary order stays intact.
          </p>
        </div>
      </div>
      <div className="overview-days-v4">
        {itinerary.days.map((day, dayIndex) => {
          const date = day.date ? parseISO(day.date) : null;
          const layout = publicOverviewDayLayout(day);
          const firstMediaItemRef = layout.find(({ media }) => media.length)?.item.ref;
          const locality = publicDayCityLabel(day);
          return (
            <article
              aria-current={selectedDayRef === day.ref ? "true" : undefined}
              className="public-overview-day overview-day-v4"
              data-public-day-ref={day.ref}
              key={day.ref}
              onClick={(event) => {
                if (
                  !(event.target as Element).closest("[data-public-item-ref], a, button, summary")
                )
                  onSelectDay(day.ref);
              }}
              tabIndex={-1}
            >
              <header className="overview-day-heading-v4">
                <div className="overview-day-title-v4">
                  <strong>
                    D{day.dayNumber} · {date ? format(date, "MMM d") : "Date TBD"}
                  </strong>
                  {locality ? <span>{locality}</span> : null}
                </div>
                <span className="overview-day-items-v4">
                  {layout.length} {layout.length === 1 ? "item" : "items"}
                </span>
              </header>
              {layout.length ? (
                <div className="public-overview-board overview-board-v4">
                  {layout.map((presentation, index) => (
                    <PublicOverviewCard
                      key={presentation.item.ref}
                      onSelect={() => onSelectItem(presentation.item.ref, day.ref)}
                      order={index + 1}
                      presentation={presentation}
                      prioritizeMedia={
                        dayIndex === 0 && presentation.item.ref === firstMediaItemRef
                      }
                      selected={selectedItemRef === presentation.item.ref}
                    />
                  ))}
                </div>
              ) : (
                <p className="public-overview-empty">No shared plans for this day.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
