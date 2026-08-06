import { format, parseISO } from "date-fns";
import { Bed, CarFront, MapPin, NotebookText, Route, Sparkles, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { isPublicTransfer, orderedPublicItems, publicDayCitySequence } from "../presentation";
import type { PublicItineraryDay, PublicItineraryItem } from "../types";
import { PublicItemLine } from "./public-item-line";

type SelectionProps = {
  dayRef: string;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedItemRef?: string;
};

function TimelineActivity({
  dayRef,
  index,
  item,
  onSelectItem,
  selectedItemRef,
}: SelectionProps & { index: number; item: PublicItineraryItem }) {
  return (
    <li className="public-timeline-item relative grid grid-cols-[2rem_minmax(0,1fr)] gap-2 py-2">
      <span
        aria-hidden="true"
        className="relative z-10 mt-1 flex size-8 items-center justify-center border border-primary/30 bg-background text-primary"
      >
        <Sparkles className="size-3.5" />
      </span>
      <div className="min-w-0 border-b pb-2 last:border-b-0">
        <PublicItemLine
          contextLabel={`Activity ${index + 1}`}
          item={item}
          onSelect={() => onSelectItem(item.ref, dayRef)}
          selected={selectedItemRef === item.ref}
          showIcon={false}
        />
      </div>
    </li>
  );
}

function TimelineStay({
  dayRef,
  items,
  onSelectItem,
  selectedItemRef,
}: SelectionProps & { items: PublicItineraryItem[] }) {
  if (!items.length) return null;

  return (
    <li
      aria-label="Stay after final activity"
      className="public-timeline-stay relative grid grid-cols-[2rem_minmax(0,1fr)] gap-2 py-2"
    >
      <span
        aria-hidden="true"
        className="relative z-10 mt-1 flex size-8 items-center justify-center bg-primary text-primary-foreground"
      >
        <Bed className="size-3.5" />
      </span>
      <div className="min-w-0 border border-primary/20 bg-primary/[0.035] px-2.5 py-2">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
          Stay · End of day
        </h3>
        <div className="space-y-1">
          {items.map((item) => (
            <PublicItemLine
              item={item}
              key={item.ref}
              onSelect={() => onSelectItem(item.ref, dayRef)}
              selected={selectedItemRef === item.ref}
              showIcon={false}
            />
          ))}
        </div>
      </div>
    </li>
  );
}

function DayDetailGroup({
  dayRef,
  icon: Icon,
  items,
  label,
  onSelectItem,
  selectedItemRef,
}: SelectionProps & {
  icon: LucideIcon;
  items: PublicItineraryItem[];
  label: string;
}) {
  if (!items.length) return null;

  return (
    <section
      aria-label={label}
      className="grid grid-cols-[2rem_minmax(0,1fr)] gap-2 border-t py-2.5"
    >
      <span
        aria-hidden="true"
        className="flex size-8 items-center justify-center bg-muted text-primary"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </h3>
        <div className="space-y-1">
          {items.map((item) => (
            <PublicItemLine
              item={item}
              key={item.ref}
              onSelect={() => onSelectItem(item.ref, dayRef)}
              selected={selectedItemRef === item.ref}
              showIcon={false}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

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
  const citySequence = publicDayCitySequence(day);
  const ordered = orderedPublicItems(day);
  const activities = ordered.filter(({ type }) => type === "activity");
  const transport = ordered.filter(isPublicTransfer);
  const meals = ordered.filter(({ type }) => type === "meal");
  const rentals = ordered.filter(({ type }) => type === "car_rental");
  const notes = ordered.filter(({ type }) => type === "note");
  const stays = ordered.filter(({ type }) => type === "hotel");
  const selectionProps = { dayRef: day.ref, onSelectItem, selectedItemRef };

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
          {activities.length} {activities.length === 1 ? "activity" : "activities"}
        </p>
      </header>
      <div className="min-w-0 px-3 py-3">
        {citySequence.length ? (
          <p className="mb-2 flex min-w-0 items-center gap-1.5 text-xs font-semibold">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{citySequence.join(" → ")}</span>
          </p>
        ) : null}

        {activities.length || stays.length ? (
          <ol className="relative before:absolute before:bottom-5 before:left-[0.98rem] before:top-5 before:w-px before:bg-primary/25">
            {activities.map((item, index) => (
              <TimelineActivity {...selectionProps} index={index} item={item} key={item.ref} />
            ))}
            <TimelineStay {...selectionProps} items={stays} />
          </ol>
        ) : (
          <p className="py-2 text-xs text-muted-foreground">No shared activities.</p>
        )}

        <aside aria-label={`Day ${day.dayNumber} details`} className="mt-2">
          <DayDetailGroup {...selectionProps} icon={Route} items={transport} label="Transport" />
          <DayDetailGroup {...selectionProps} icon={Utensils} items={meals} label="Meals" />
          <DayDetailGroup {...selectionProps} icon={CarFront} items={rentals} label="Car rental" />
          <DayDetailGroup {...selectionProps} icon={NotebookText} items={notes} label="Notes" />
        </aside>

        {day.notes ? (
          <p className="mt-2 whitespace-pre-wrap border-l-2 border-muted px-3 py-1 text-xs leading-5 text-muted-foreground">
            {day.notes}
          </p>
        ) : null}
      </div>
    </article>
  );
}
