import { format, parseISO } from "date-fns";
import { MapPin } from "lucide-react";

import {
  isPublicDestination,
  isPublicTravel,
  orderedPublicItems,
  publicDayCitySequence,
} from "../presentation";
import type { PublicItineraryDay } from "../types";
import { PublicItemLine } from "./public-item-line";
import { PublicTimelineDestinations } from "./public-timeline-destinations";
import { PublicTransportRow } from "./public-transport-row";

export function PublicTimelineDay({
  day,
  onSelectDay,
  onSelectItem,
  selected,
  selectedItemRef,
}: {
  day: PublicItineraryDay;
  onSelectDay: (dayRef: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selected: boolean;
  selectedItemRef?: string;
}) {
  const localities = publicDayCitySequence(day);
  const ordered = orderedPublicItems(day).filter(({ type }) => type !== "location");
  const destinations = ordered.filter(isPublicDestination);
  const travel = ordered.filter(isPublicTravel);
  const notes = ordered.filter(({ type }) => type === "note");

  return (
    <article
      aria-current={selected ? "true" : undefined}
      className={`grid grid-cols-[5.75rem_minmax(0,1fr)] bg-background sm:grid-cols-[6.5rem_minmax(0,1fr)] ${selected ? "bg-primary/[0.035]" : ""}`}
      data-public-day-ref={day.ref}
      id={`day-${day.dayNumber}`}
      onClick={(event) => {
        if (!(event.target as Element).closest("[data-public-item-ref]")) onSelectDay(day.ref);
      }}
      tabIndex={-1}
    >
      <header className="border-r px-2 py-3">
        <h2 className="text-xs font-semibold">Day {day.dayNumber}</h2>
        <p className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
          {day.date ? format(parseISO(day.date), "MMM d") : "Date TBD"}
        </p>
        <p className="mt-1 text-[10px] font-medium text-primary">
          {destinations.length} {destinations.length === 1 ? "stop" : "stops"}
        </p>
      </header>
      <div className="min-w-0 px-3 py-3">
        {localities.length ? (
          <p className="mb-2 flex min-w-0 items-center gap-1.5 text-xs font-semibold">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{localities.join(" · ")}</span>
          </p>
        ) : null}

        <PublicTimelineDestinations
          dayRef={day.ref}
          items={destinations}
          onSelectItem={onSelectItem}
          selectedItemRef={selectedItemRef}
        />

        <PublicTransportRow items={travel} />

        {notes.length ? (
          <section aria-label="Shared notes" className="mt-2 border-t pt-3">
            <h3 className="sr-only">Notes</h3>
            <div className="space-y-1.5">
              {notes.map((item) => (
                <PublicItemLine
                  item={item}
                  key={item.ref}
                  onSelect={() => onSelectItem(item.ref, day.ref)}
                  selected={selectedItemRef === item.ref}
                />
              ))}
            </div>
          </section>
        ) : null}

        {day.notes ? (
          <p className="mt-2 whitespace-pre-wrap border-l-2 border-muted px-3 py-1 text-xs leading-5 text-muted-foreground">
            {day.notes}
          </p>
        ) : null}
      </div>
    </article>
  );
}
