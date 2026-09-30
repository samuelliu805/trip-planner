"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicItinerary } from "../../types";
import { EditionNavigation } from "./edition-navigation";
import { ItineraryEdition } from "./itinerary-edition";

export function ContinuousItineraryEdition({
  itinerary,
  selectedDayRef,
  ...props
}: {
  itinerary: PublicItinerary;
  selectedDayRef?: string;
  selectedItemRef?: string;
  onSelectDay: (ref: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  templateId: "ethereal" | "journal";
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const navigation = useRef<HTMLDivElement>(null);
  const [readingDayRef, setReadingDayRef] = useState<string | undefined>(itinerary.days[0]?.ref);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    let frame = 0;
    let anchor: { chapter: HTMLElement; offset: number; scrollTop: number } | undefined;
    function keepReadingPosition() {
      if (!node || !anchor || Math.abs(node.scrollTop - anchor.scrollTop) > 1) return;
      const delta =
        anchor.chapter.getBoundingClientRect().top -
        node.getBoundingClientRect().top -
        anchor.offset;
      if (Math.abs(delta) > 1) node.scrollTop += delta;
      anchor.scrollTop = node.scrollTop;
    }
    function recordJump(event: Event) {
      const ref = (event as CustomEvent<string>).detail;
      const chapter = [
        ...(node?.querySelectorAll<HTMLElement>(".edition-day[data-public-day-ref]") ?? []),
      ].find((entry) => entry.dataset.publicDayRef === ref);
      if (!node || !chapter) return;
      anchor = {
        chapter,
        offset: chapter.getBoundingClientRect().top - node.getBoundingClientRect().top,
        scrollTop: node.scrollTop,
      };
      setReadingDayRef(ref);
      schedule();
    }
    function update() {
      frame = 0;
      if (!node || !node.getClientRects().length) return;
      node.style.setProperty("--edition-reader-height", `${node.clientHeight}px`);
      // A late image above the reader must not displace an explicit chapter jump.
      // A changed scrollTop means the reader moved and establishes a new anchor.
      keepReadingPosition();
      const top = node.getBoundingClientRect().top + 24;
      const chapters = [...node.querySelectorAll<HTMLElement>(".edition-day[data-public-day-ref]")];
      const atBottom =
        node.scrollTop > 0 && node.scrollHeight - node.scrollTop - node.clientHeight <= 1;
      const current = atBottom
        ? chapters.at(-1)
        : (chapters.findLast((chapter) => chapter.getBoundingClientRect().top <= top) ??
          chapters[0]);
      if (current) {
        setReadingDayRef(current.dataset.publicDayRef);
        const offset = current.getBoundingClientRect().top - node.getBoundingClientRect().top;
        anchor = offset <= 24 ? { chapter: current, offset, scrollTop: node.scrollTop } : undefined;
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener("scroll", schedule, { passive: true });
    node.addEventListener("public-day-jump", recordJump);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      node.removeEventListener("scroll", schedule);
      node.removeEventListener("public-day-jump", recordJump);
    };
  }, [itinerary.days]);
  useEffect(() => {
    // Only move the date strip. Reading never changes content-to-map selection.
    const current = navigation.current?.querySelector<HTMLElement>("[aria-current=date]");
    const strip = current?.closest("ol");
    if (current && strip)
      strip.scrollLeft +=
        current.getBoundingClientRect().left -
        strip.getBoundingClientRect().left -
        (strip.clientWidth - current.offsetWidth) / 2;
  }, [readingDayRef]);
  return (
    <>
      <div ref={navigation}>
        <EditionNavigation
          days={itinerary.days}
          selectedDayRef={readingDayRef}
          onSelectDay={props.onSelectDay}
          variant="dates"
        />
      </div>
      <div ref={scroller} className="public-view-scroll edition-continuous-scroll overflow-y-auto">
        <ItineraryEdition
          {...props}
          itinerary={itinerary}
          selectedDayRef={readingDayRef ?? selectedDayRef}
        />
      </div>
    </>
  );
}
