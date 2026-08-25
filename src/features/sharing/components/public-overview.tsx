"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";

import { publicDayCityLabel } from "../presentation";
import { publicOverviewDaySections } from "../public-overview-presentation";
import type { PublicItinerary } from "../types";
import { PublicOverviewCard } from "./public-overview-card";
import { PublicOverviewTransportList } from "./public-overview-transport-list";

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
  const { locale, t } = useI18n();
  return (
    <section
      aria-label="Whole trip overview"
      data-i18n-aria-label={"Whole trip overview"}
      className="public-overview overview-v4"
    >
      <div className="overview-title-row-v4">
        <div>
          <div className="public-section-label">
            <T message={"Whole trip overview"} />
          </div>
          <p className="overview-subtitle-v4">
            <T
              message={
                " Media-aware board. Shared place imagery and attachments receive visual weight while manual itinerary order stays intact. "
              }
            />
          </p>
        </div>
      </div>
      <div className="overview-days-v4">
        {itinerary.days.map((day, dayIndex) => {
          const date = day.date ? parseISO(day.date) : null;
          const sections = publicOverviewDaySections(day);
          const planCount = sections.cards.length;
          const itemCount = sections.transport.length + planCount;
          const firstMediaItemRef = sections.cards.find(({ media }) => media.length)?.item.ref;
          const locality = publicDayCityLabel(day);
          return (
            <article
              aria-current={selectedDayRef === day.ref ? "true" : undefined}
              className="public-overview-day overview-day-v4"
              data-day-number={String(day.dayNumber).padStart(2, "0")}
              data-public-day-ref={day.ref}
              key={day.ref}
              onClick={(event) => {
                if (
                  !(event.target as Element).closest(
                    "[data-public-item-ref], [data-public-transport], a, button, summary",
                  )
                )
                  onSelectDay(day.ref);
              }}
              tabIndex={-1}
            >
              <header className="overview-day-heading-v4">
                <div className="overview-day-title-v4">
                  <strong>
                    <span className="overview-day-number-v4">
                      {t("D{day}", { day: day.dayNumber })}
                    </span>
                    <span className="overview-day-date-v4">
                      {date
                        ? format(date, locale === "zh-CN" ? "M月d日" : "MMM d", {
                            locale: locale === "zh-CN" ? zhCN : undefined,
                          })
                        : t("Date TBD")}
                    </span>
                  </strong>
                  {locality ? <span>{locality}</span> : null}
                </div>
                <span className="overview-day-items-v4">
                  {locale === "zh-CN"
                    ? `${planCount} 项安排`
                    : `${planCount} ${planCount === 1 ? "plan" : "plans"}`}
                </span>
              </header>
              {itemCount ? (
                <>
                  <PublicOverviewTransportList items={sections.transport} />
                  {sections.cards.length ? (
                    <div className="public-overview-board overview-board-v4">
                      {sections.cards.map((presentation) => (
                        <PublicOverviewCard
                          key={presentation.item.ref}
                          onSelect={() => onSelectItem(presentation.item.ref, day.ref)}
                          order={presentation.order}
                          presentation={presentation}
                          prioritizeMedia={
                            dayIndex === 0 && presentation.item.ref === firstMediaItemRef
                          }
                          selected={selectedItemRef === presentation.item.ref}
                        />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="public-overview-empty">
                  <T message={"No shared plans for this day."} />
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
