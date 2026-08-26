"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

import {
  MatrixGridHeader,
  MatrixItemSummary,
} from "@/features/itinerary/components/matrix-presentation";
import { matrixCategoryColumns } from "@/features/itinerary/components/matrix-columns";
import { transportModeLabels, type TransportMode } from "@/features/itinerary/types";

import { orderedPublicItemMedia } from "../public-media-presentation";
import type { PublicItinerary, PublicItineraryItem } from "../types";
import { PublicItemMediaGallery } from "./public-item-media";
import { PublicQuickActions } from "./public-quick-actions";
import { useContainedPublicMatrix } from "./use-contained-public-matrix";

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
  const matrixRef = useContainedPublicMatrix();
  const { locale, t } = useI18n();
  const columns = itinerary.settings.showNotes
    ? matrixCategoryColumns
    : matrixCategoryColumns.filter(({ id }) => id !== "notes");

  return (
    <section
      aria-label="Read-only itinerary matrix"
      data-i18n-aria-label={"Read-only itinerary matrix"}
      className="public-matrix h-full min-w-0 overflow-auto border-y bg-background outline-none"
      ref={matrixRef}
      role="region"
      tabIndex={0}
    >
      <div
        aria-colcount={columns.length + 2}
        aria-label={t("{title} read-only itinerary matrix", { title: itinerary.trip.title })}
        aria-rowcount={itinerary.days.length + 1}
        className="min-w-max"
        role="grid"
      >
        <MatrixGridHeader columns={columns} mobileDateLabel="Day / Date" />
        {itinerary.days.map((day, rowIndex) => {
          return (
            <div
              aria-current={selectedDayRef === day.ref ? "true" : undefined}
              className={`flex min-h-11 border-b min-[1200px]:min-h-[52px] ${selectedDayRef === day.ref ? "bg-primary/[0.035]" : ""}`}
              data-public-day-ref={day.ref}
              key={day.ref}
              onClick={() => onSelectDay(day.ref)}
              role="row"
              tabIndex={-1}
            >
              <div
                className="matrix-date-column sticky left-0 z-30 w-24 shrink-0 border-r bg-background px-2 py-1 text-[13px] leading-[1.35] min-[1200px]:text-[11px]"
                role="rowheader"
              >
                <span className="block font-sans text-[15px] font-semibold leading-[1.25] min-[1200px]:text-[13px] sm:hidden">
                  <T message={"Day {day}"} values={{ day: day.dayNumber }} />
                </span>
                <span className="block font-mono text-[15px] font-medium leading-[1.25] min-[1200px]:text-[13px]">
                  {day.date
                    ? format(parseISO(day.date), locale === "zh-CN" ? "M月d日" : "MMM d", {
                        locale: locale === "zh-CN" ? zhCN : undefined,
                      })
                    : t("Date TBD")}
                </span>
                {day.date ? (
                  <span className="block text-[13px] leading-[1.35] text-muted-foreground min-[1200px]:text-[11px]">
                    {format(parseISO(day.date), "EEE", {
                      locale: locale === "zh-CN" ? zhCN : undefined,
                    })}
                  </span>
                ) : null}
              </div>
              <div
                className="matrix-day-column sticky left-24 z-20 w-16 shrink-0 border-r bg-background px-2 py-1 text-[15px] font-semibold leading-[1.25] min-[1200px]:text-[13px]"
                role="rowheader"
              >
                {locale === "zh-CN" ? t("Day {day}", { day: day.dayNumber }) : day.dayNumber}
              </div>
              {columns.map((column, columnIndex) => {
                const items = day.items
                  .filter((item) => column.types.includes(item.type))
                  .sort((left, right) => left.sortOrder - right.sortOrder);
                return (
                  <div
                    aria-colindex={columnIndex + 3}
                    aria-rowindex={rowIndex + 2}
                    className={`${column.width} shrink-0 border-r p-0.5`}
                    key={column.id}
                    role="gridcell"
                  >
                    <div
                      className={`public-table-cell-items ${column.id === "transport" ? "is-transport" : ""}`}
                    >
                      {column.id === "city" ? (
                        <div
                          className="matrix-city-summary flex min-h-11 min-w-0 flex-col justify-center px-1.5 py-1 min-[1200px]:min-h-8"
                          data-city-summary=""
                        >
                          <MatrixItemSummary
                            title={
                              day.localities?.join(" · ") ||
                              day.primaryLocality ||
                              t("City / town unavailable")
                            }
                            type="location"
                          />
                        </div>
                      ) : null}
                      {items.map((item) => (
                        <div
                          aria-current={selectedItemRef === item.ref ? "true" : undefined}
                          className={`public-item-focus min-h-11 cursor-default px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring min-[1200px]:min-h-8 ${selectedItemRef === item.ref ? "bg-primary/5" : ""}`}
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
                          <PublicItemMediaGallery
                            media={orderedPublicItemMedia(item)}
                            variant="table"
                          />
                          <PublicQuickActions item={item} />
                        </div>
                      ))}
                    </div>
                    {!items.length && column.id !== "city" ? (
                      <span className="block px-1.5 py-1 text-[13px] leading-[1.35] text-muted-foreground min-[1200px]:text-[11px]">
                        —
                      </span>
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
