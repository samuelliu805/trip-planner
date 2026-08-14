import { format, parseISO } from "date-fns";
import { NotebookText } from "lucide-react";

import { publicDayCityLabel } from "../presentation";
import { publicTimelineDayPresentation } from "../public-timeline-presentation";
import type { PublicItineraryDay } from "../types";
import { PublicTimelineNode } from "./public-timeline-node";
import { PublicTimelineTransport } from "./public-timeline-transport";

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
  const locality = publicDayCityLabel(day);
  const { nodes, notes, transfers } = publicTimelineDayPresentation(day);
  const itemCount = nodes.length + notes.length + transfers.length;

  return (
    <article
      aria-current={selected ? "true" : undefined}
      className={`timeline-section-v4 ${selected ? "is-selected" : ""}`}
      data-public-day-ref={day.ref}
      id={`day-${day.dayNumber}`}
      onClick={(event) => {
        if (!(event.target as Element).closest("[data-public-item-ref], a, button, summary"))
          onSelectDay(day.ref);
      }}
      tabIndex={-1}
    >
      <header className="timeline-section-header-v4">
        <span className="timeline-day-index-v4">D{day.dayNumber}</span>
        <div className="timeline-day-copy-v4">
          <strong>{day.date ? format(parseISO(day.date), "MMM d") : "Date TBD"}</strong>
          {locality ? <span>{locality}</span> : null}
        </div>
        <span className="timeline-day-count-v4">
          {itemCount} {itemCount === 1 ? "item" : "items"}
        </span>

        {transfers.length ? (
          <section aria-label="Major transport" className="timeline-transport-list-v4">
            {transfers.map(({ item, label }) => (
              <PublicTimelineTransport
                item={item}
                key={item.ref}
                label={label}
                onSelect={() => onSelectItem(item.ref, day.ref)}
                selected={selectedItemRef === item.ref}
              />
            ))}
          </section>
        ) : null}
      </header>

      {nodes.length ? (
        <ol className="public-timeline-rail timeline-node-list-v4">
          {nodes.map((node) => (
            <PublicTimelineNode
              key={node.item.ref}
              node={node}
              onSelect={() => onSelectItem(node.item.ref, day.ref)}
              selected={selectedItemRef === node.item.ref}
            />
          ))}
        </ol>
      ) : transfers.length || notes.length || day.notes ? null : (
        <p className="public-timeline-empty">No shared plans for this day.</p>
      )}

      {notes.length ? (
        <section aria-label="Shared notes" className="public-timeline-notes">
          {notes.map((item) => (
            <div
              aria-current={selectedItemRef === item.ref ? "true" : undefined}
              className={`public-item-focus public-timeline-note ${selectedItemRef === item.ref ? "is-selected" : ""}`}
              data-public-item-ref={item.ref}
              key={item.ref}
              onClick={() => onSelectItem(item.ref, day.ref)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectItem(item.ref, day.ref);
                }
              }}
              role="button"
              tabIndex={0}
            >
              <NotebookText
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="min-w-0">
                <span className="block font-medium">{item.title}</span>
                {item.notes ? (
                  <span className="mt-0.5 block whitespace-pre-wrap leading-5 text-muted-foreground">
                    {item.notes}
                  </span>
                ) : null}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {day.notes ? <p className="public-timeline-day-notes">{day.notes}</p> : null}
    </article>
  );
}
