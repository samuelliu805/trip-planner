import { format, parseISO } from "date-fns";
import { MapPin } from "lucide-react";

import { publicDayCitySequence } from "../presentation";
import type { PublicItinerary } from "../types";
import { PublicDayJourney } from "./public-day-journey";

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
    <section aria-label="Whole trip overview" className="public-overview divide-y border-y">
      {itinerary.days.map((day) => {
        const citySequence = publicDayCitySequence(day);
        const date = day.date ? parseISO(day.date) : null;
        return (
          <article
            aria-current={selectedDayRef === day.ref ? "true" : undefined}
            className={`public-overview-day grid grid-cols-[5.75rem_minmax(0,1fr)] bg-background sm:grid-cols-[6.5rem_minmax(0,1fr)] ${selectedDayRef === day.ref ? "bg-primary/[0.035]" : ""}`}
            data-public-day-ref={day.ref}
            key={day.ref}
            onClick={(event) => {
              if (!(event.target as Element).closest("[data-public-item-ref]"))
                onSelectDay(day.ref);
            }}
            tabIndex={-1}
          >
            <div className="border-r px-2 py-3">
              <div className="text-xs font-semibold">D{day.dayNumber}</div>
              <div className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
                {date ? format(date, "MMM d") : "Date TBD"}
              </div>
              <div className="mt-0.5 text-[10px] font-medium text-primary">
                {citySequence.length
                  ? `${citySequence.length} ${citySequence.length === 1 ? "stop" : "stops"}`
                  : "Plans"}
              </div>
            </div>
            <div className="min-w-0 px-3 py-3">
              {citySequence.length ? (
                <div className="mb-3 flex min-w-0 items-center gap-1.5 text-xs font-semibold">
                  <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
                  <span className="truncate">{citySequence.join(" → ")}</span>
                </div>
              ) : null}

              <PublicDayJourney
                day={day}
                mode="overview"
                onSelectItem={(itemRef) => onSelectItem(itemRef, day.ref)}
                selectedItemRef={selectedItemRef}
              />
            </div>
          </article>
        );
      })}
    </section>
  );
}
