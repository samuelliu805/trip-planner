"use client";

import { T, useI18n } from "@/features/i18n/i18n-provider";
import { format, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import { NotebookText } from "lucide-react";
import { useEffect, useRef } from "react";

import { publicDayCityLabel } from "../presentation";
import { orderedPublicItemMedia } from "../public-media-presentation";
import { publicTimelineDayPresentation } from "../public-timeline-presentation";
import type { PublicItineraryDay } from "../types";
import { PublicTimelineNode } from "./public-timeline-node";
import { PublicTimelineTransport } from "./public-timeline-transport";
import { PublicItemMediaGallery } from "./public-item-media";

function useTimelineRailWheel() {
  const sectionRef = useRef<HTMLElement>(null);
  const railRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const timelineSection: HTMLElement = section;

    function handleWheel(event: WheelEvent) {
      if (window.innerWidth < 900 || event.ctrlKey || event.deltaY === 0) return;

      const deltaScale =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? timelineSection.clientHeight : 1;
      const delta = event.deltaY * deltaScale;
      const timelineRail = railRef.current;
      const maxRailScroll = timelineRail
        ? Math.max(0, timelineRail.scrollWidth - timelineRail.clientWidth)
        : 0;

      event.preventDefault();
      event.stopPropagation();

      if (timelineRail) {
        const edgeTolerance = 6;
        const atStart = timelineRail.scrollLeft <= edgeTolerance;
        const atEnd = maxRailScroll - timelineRail.scrollLeft <= edgeTolerance;
        const handOffToDays = (delta < 0 && atStart) || (delta > 0 && atEnd);

        if (handOffToDays) {
          timelineRail.scrollLeft = delta < 0 ? 0 : maxRailScroll;
        } else {
          const nextRailScroll = Math.max(
            0,
            Math.min(maxRailScroll, timelineRail.scrollLeft + delta),
          );
          if (Math.abs(nextRailScroll - timelineRail.scrollLeft) > 0.5) {
            timelineRail.scrollLeft = nextRailScroll;
            return;
          }
        }
      }

      const viewScroller = timelineSection.closest<HTMLElement>(".public-view-scroll");
      if (viewScroller) viewScroller.scrollTop += delta;
    }

    timelineSection.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => timelineSection.removeEventListener("wheel", handleWheel, { capture: true });
  }, []);

  return { railRef, sectionRef };
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
  const locality = publicDayCityLabel(day);
  const { nodes, notes, transfers } = publicTimelineDayPresentation(day);
  const planCount = nodes.length + notes.length;
  const { railRef: timelineRailRef, sectionRef: timelineSectionRef } = useTimelineRailWheel();
  const { locale, t } = useI18n();

  return (
    <article
      aria-current={selected ? "true" : undefined}
      className={`timeline-section-v4 ${selected ? "is-selected" : ""}`}
      data-day-number={String(day.dayNumber).padStart(2, "0")}
      data-public-day-ref={day.ref}
      id={`day-${day.dayNumber}`}
      onClick={(event) => {
        if (
          !(event.target as Element).closest(
            "[data-public-item-ref], [data-public-transport], a, button, summary",
          )
        )
          onSelectDay(day.ref);
      }}
      ref={timelineSectionRef}
      tabIndex={-1}
    >
      <header className="timeline-section-header-v4">
        <span className="timeline-day-index-v4">{t("D{day}", { day: day.dayNumber })}</span>
        <div className="timeline-day-copy-v4">
          <strong>
            {day.date
              ? format(parseISO(day.date), locale === "zh-CN" ? "M月d日" : "MMM d", {
                  locale: locale === "zh-CN" ? zhCN : undefined,
                })
              : t("Date TBD")}
          </strong>
          {locality ? <span>{locality}</span> : null}
        </div>
        <span className="timeline-day-count-v4">
          {locale === "zh-CN"
            ? `${planCount} 项安排`
            : `${planCount} ${planCount === 1 ? "plan" : "plans"}`}
        </span>

        {transfers.length ? (
          <section
            aria-label="Major transport"
            data-i18n-aria-label={"Major transport"}
            className="timeline-transport-list-v4"
          >
            <span aria-hidden="true" className="timeline-transport-label-v4">
              <T message={" Transport "} />
            </span>
            <div className="timeline-transport-items-v4">
              {transfers.map(({ item, label }) => (
                <PublicTimelineTransport item={item} key={item.ref} label={label} />
              ))}
            </div>
          </section>
        ) : null}
      </header>

      {nodes.length ? (
        <ol className="public-timeline-rail timeline-node-list-v4" ref={timelineRailRef}>
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
        <p className="public-timeline-empty">
          <T message={"No shared plans for this day."} />
        </p>
      )}

      {notes.length ? (
        <section
          aria-label="Shared notes"
          data-i18n-aria-label={"Shared notes"}
          className="public-timeline-notes"
        >
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
              <PublicItemMediaGallery media={orderedPublicItemMedia(item)} variant="timeline" />
            </div>
          ))}
        </section>
      ) : null}

      {day.notes ? <p className="public-timeline-day-notes">{day.notes}</p> : null}
    </article>
  );
}
