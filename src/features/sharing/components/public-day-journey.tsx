import { Bed, NotebookText } from "lucide-react";

import { publicDayJourney } from "../presentation";
import type { PublicItineraryDay } from "../types";
import { PublicJourneyGroups } from "./public-journey-groups";
import { PublicItemLine } from "./public-item-line";
import { PublicOverviewIcon } from "./public-overview-icon";
import { PublicTransportRow } from "./public-transport-row";

export function PublicDayJourney({
  day,
  onSelectItem,
  selectedItemRef,
}: {
  day: PublicItineraryDay;
  onSelectItem: (itemRef: string) => void;
  selectedItemRef?: string;
}) {
  const { groups, notes, stays, transport } = publicDayJourney(day);
  const hasContent = Boolean(
    groups.length || transport.length || stays.length || notes.length || day.notes,
  );

  if (!hasContent)
    return <p className="py-2 text-xs text-muted-foreground">No shared plans for this day.</p>;

  return (
    <>
      <PublicJourneyGroups
        groups={groups}
        onSelectItem={onSelectItem}
        selectedItemRef={selectedItemRef}
      />

      <PublicTransportRow
        items={transport}
        onSelectItem={onSelectItem}
        selectedItemRef={selectedItemRef}
      />

      {notes.length ? (
        <section
          aria-label="Notes"
          className="mt-1 grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2 border-t py-2"
        >
          <PublicOverviewIcon icon={NotebookText} muted />
          <div className="min-w-0 space-y-1">
            {notes.map((item) => (
              <PublicItemLine
                compact
                item={item}
                key={item.ref}
                onSelect={() => onSelectItem(item.ref)}
                selected={selectedItemRef === item.ref}
                showIcon={false}
              />
            ))}
          </div>
        </section>
      ) : null}

      {stays.length ? (
        <section
          aria-label="Stay at the end of the day"
          className="mt-1 grid min-w-0 grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-2 border-t py-2"
        >
          <PublicOverviewIcon icon={Bed} />
          <h3 className="sr-only">Stay</h3>
          <div className="min-w-0 flex-1 space-y-1">
            {stays.map((item) => (
              <PublicItemLine
                compact
                item={item}
                key={item.ref}
                onSelect={() => onSelectItem(item.ref)}
                selected={selectedItemRef === item.ref}
                showIcon={false}
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
    </>
  );
}
