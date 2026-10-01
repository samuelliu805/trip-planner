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
    let explicitRef: string | undefined;
    let touchY: number | undefined;
    let anchor: { chapter: HTMLElement; offset: number; scrollTop: number } | undefined;
    function keepReadingPosition() {
      if (!node || !explicitRef || !anchor) return;
      const delta =
        anchor.chapter.getBoundingClientRect().top -
        node.getBoundingClientRect().top -
        anchor.offset;
      if (Math.abs(delta) > 1) node.scrollTop += delta;
      anchor.scrollTop = node.scrollTop;
    }
    function photoReady() {
      keepReadingPosition();
      schedule();
    }
    function recordJump(event: Event) {
      const ref = (event as CustomEvent<string>).detail;
      const chapter = [
        ...(node?.querySelectorAll<HTMLElement>(".edition-day[data-public-day-ref]") ?? []),
      ].find((entry) => entry.dataset.publicDayRef === ref);
      if (!node || !chapter) return;
      explicitRef = ref;
      node.style.overflowAnchor = "none";
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

      // A late image above the reader must not displace an explicit chapter jump.
      // Explicit jumps use one manual anchor; user scrolling restores native anchoring.

      const top = node.getBoundingClientRect().top + 24;
      const chapters = [...node.querySelectorAll<HTMLElement>(".edition-day[data-public-day-ref]")];
      const atBottom =
        node.scrollTop > 0 && node.scrollHeight - node.scrollTop - node.clientHeight <= 1;
      const current =
        chapters.find((chapter) => chapter.dataset.publicDayRef === explicitRef) ??
        (atBottom
          ? chapters.at(-1)
          : (chapters.findLast((chapter) => chapter.getBoundingClientRect().top <= top) ??
            chapters[0]));
      if (current) {
        setReadingDayRef(current.dataset.publicDayRef);
        const offset = current.getBoundingClientRect().top - node.getBoundingClientRect().top;
        // An explicit jump owns its original offset until user input releases it.
        // A queued animation frame can run before ResizeObserver after an image
        // commit, so it must never replace that offset with the displaced one.
        if (!explicitRef)
          anchor =
            offset <= 24 ? { chapter: current, offset, scrollTop: node.scrollTop } : undefined;
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    function readerMoved() {
      explicitRef = undefined;
      anchor = undefined;
      if (node) node.style.overflowAnchor = "auto";
      schedule();
    }
    function touchStarted(event: TouchEvent) {
      touchY = event.touches[0]?.clientY;
    }
    function touchMoved(event: TouchEvent) {
      const y = event.touches[0]?.clientY;
      if (touchY !== undefined && y !== undefined && Math.abs(y - touchY) > 8) {
        readerMoved();
        touchY = undefined;
      }
    }
    function keyMoved(event: KeyboardEvent) {
      if (
        ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key) &&
        !(
          event.target instanceof Element &&
          event.target.closest("button,a,input,textarea,select,[contenteditable]")
        )
      )
        readerMoved();
    }
    function scrolled() {
      // Scrollbar dragging and programmatic movement also release an explicit jump.
      // Our own resize correction has already updated the recorded scrollTop.
      if (
        node &&
        explicitRef &&
        anchor &&
        Math.abs(
          node.scrollTop -
            Math.min(anchor.scrollTop, Math.max(0, node.scrollHeight - node.clientHeight)),
        ) > 1
      )
        readerMoved();
      schedule();
    }
    const observer = new ResizeObserver(() => {
      // ResizeObserver runs before paint. Deferring this correction to the next
      // animation frame would expose one frame of the image-induced jump.
      keepReadingPosition();
      schedule();
    });
    node.addEventListener("wheel", readerMoved, { passive: true });
    node.addEventListener("touchstart", touchStarted, { passive: true });
    node.addEventListener("keydown", keyMoved);
    node.addEventListener("touchmove", touchMoved, { passive: true });
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    node.addEventListener("scroll", scrolled, { passive: true });
    node.addEventListener("public-day-jump", recordJump);
    node.addEventListener("public-photo-ready", photoReady);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      node.style.removeProperty("overflow-anchor");
      node.removeEventListener("wheel", readerMoved);
      node.removeEventListener("touchstart", touchStarted);
      node.removeEventListener("keydown", keyMoved);
      node.removeEventListener("touchmove", touchMoved);
      node.removeEventListener("scroll", scrolled);
      node.removeEventListener("public-day-jump", recordJump);
      node.removeEventListener("public-photo-ready", photoReady);
    };
  }, [itinerary.days]);
  useEffect(() => {
    // Reveal clipped dates at the nearest edge; never recenter a visible day.
    const current = navigation.current?.querySelector<HTMLElement>("[aria-current=date]");
    const strip = current?.closest("ol");
    if (!current || !strip) return;
    const date = current.getBoundingClientRect();
    const viewport = strip.getBoundingClientRect();
    if (date.right > viewport.right) strip.scrollLeft += date.right - viewport.right;
    else if (date.left < viewport.left) strip.scrollLeft += date.left - viewport.left;
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
