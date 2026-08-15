import { format, parseISO } from "date-fns";

import {
  MatrixGridHeader,
  MatrixItemSummary,
} from "@/features/itinerary/components/matrix-presentation";
import { matrixCategoryColumns } from "@/features/itinerary/components/matrix-columns";
import { transportModeLabels, type TransportMode } from "@/features/itinerary/types";

import { PublicQuickActions } from "./public-quick-actions";
import type { PublicItinerary, PublicItineraryItem } from "../types";

function publicTransportMode(item: PublicItineraryItem): TransportMode | null {
  if (item.type === "flight") return "flight";
  if (item.type === "train") return "train";
  if (item.type === "transport") {
    const normalizedTitle = item.title.trim().toLocaleLowerCase();
    const matchingMode = Object.entries(transportModeLabels).find(
      ([, label]) => label.toLocaleLowerCase() === normalizedTitle,
    );
    return (matchingMode?.[0] as TransportMode | undefined) ?? null;
  }
  return null;
}

export function PublicTable({
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
  const columns = itinerary.settings.showNotes
    ? matrixCategoryColumns
    : matrixCategoryColumns.filter(({ id }) => id !== "notes");

  return (
    <section
      aria-label="Read-only itinerary matrix"
      className="public-matrix h-full min-w-0 overflow-auto border-y bg-background outline-none"
      role="region"
      tabIndex={0}
    >
      <div
        aria-colcount={columns.length + 2}
        aria-label={`${itinerary.trip.title} read-only itinerary matrix`}
        aria-rowcount={itinerary.days.length + 1}
        className="min-w-max"
        role="grid"
      >
        <MatrixGridHeader columns={columns} mobileDateLabel="Day / Date" />
        {itinerary.days.map((day, rowIndex) => {
          return (
            <div
              aria-current={selectedDayRef === day.ref ? "true" : undefined}
              className={`flex min-h-24 border-b ${selectedDayRef === day.ref ? "bg-primary/[0.035]" : ""}`}
              data-public-day-ref={day.ref}
              key={day.ref}
              onClick={() => onSelectDay(day.ref)}
              role="row"
              tabIndex={-1}
            >
              <div
                className="matrix-date-column sticky left-0 z-30 w-24 shrink-0 border-r bg-background px-2 py-2 text-xs"
                role="rowheader"
              >
                <span className="block font-sans text-sm font-semibold leading-4 sm:hidden">
                  Day {day.dayNumber}
                </span>
                <span className="mt-0.5 block font-mono text-xs font-medium">
                  {day.date ? format(parseISO(day.date), "MMM d") : "Date TBD"}
                </span>
                {day.date ? (
                  <span className="block text-[10px] text-muted-foreground">
                    {format(parseISO(day.date), "EEE")}
                  </span>
                ) : null}
              </div>
              <div
                className="matrix-day-column sticky left-24 z-20 w-16 shrink-0 border-r bg-background px-2 py-2 text-xs font-semibold"
                role="rowheader"
              >
                {day.dayNumber}
              </div>
              {columns.map((column, columnIndex) => {
                const items = day.items
                  .filter((item) => column.types.includes(item.type))
                  .sort((left, right) => left.sortOrder - right.sortOrder);
                return (
                  <div
                    aria-colindex={columnIndex + 3}
                    aria-rowindex={rowIndex + 2}
                    className={`${column.width} shrink-0 border-r p-1`}
                    key={column.id}
                    role="gridcell"
                  >
                    <div
                      className={`public-table-cell-items ${column.id === "transport" ? "is-transport" : ""}`}
                    >
                      {column.id === "city" ? (
                        <div className="px-1.5 py-1.5 text-xs">
                          <span className="font-medium">
                            {day.localities?.join(" · ") ||
                              day.primaryLocality ||
                              "City / town unavailable"}
                          </span>
                        </div>
                      ) : null}
                      {items.map((item) => (
                        <div
                          aria-current={selectedItemRef === item.ref ? "true" : undefined}
                          className={`public-item-focus min-h-11 cursor-default px-1.5 py-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 ${selectedItemRef === item.ref ? "bg-primary/5" : ""}`}
                          data-public-item-ref={item.ref}
                          key={item.ref}
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelectItem(item.ref, day.ref);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              onSelectItem(item.ref, day.ref);
                            }
                          }}
                          tabIndex={0}
                        >
                          <MatrixItemSummary
                            startTime={item.startTime}
                            title={item.title}
                            transportMode={publicTransportMode(item)}
                            type={item.type}
                          />
                          <PublicQuickActions item={item} />
                        </div>
                      ))}
                    </div>
                    {!items.length && column.id !== "city" ? (
                      <span className="block px-1.5 py-1 text-xs text-muted-foreground">—</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
