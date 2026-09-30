"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import type { PublicItinerary } from "../../types";
import { EditionDayPager } from "./edition-day-pager";
import { ItineraryEdition } from "./itinerary-edition";

export function PagedItineraryEdition({
  itinerary,
  selectedDayRef,
  onSelectDay,
  ...props
}: {
  itinerary: PublicItinerary;
  selectedDayRef?: string;
  selectedItemRef?: string;
  onSelectDay: (ref: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  templateId: "ethereal" | "journal";
}) {
  const index = Math.max(
    0,
    itinerary.days.findIndex((day) => day.ref === selectedDayRef),
  );
  const day = itinerary.days[index];
  const gesture = useRef<{ x: number; y: number; id: number } | null>(null);
  const suppressClickUntil = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    const containHorizontalSwipe = (event: TouchEvent) => {
      const start = gesture.current;
      const touch = event.touches[0];
      if (!start || !touch || event.touches.length !== 1) return;
      const x = Math.abs(touch.clientX - start.x);
      const y = Math.abs(touch.clientY - start.y);
      // Claim horizontal movement before the browser starts a fling that can
      // consume the next tap. Vertical reading keeps native scroll behavior.
      if (x >= 8 && x >= y * 1.5 && event.cancelable) event.preventDefault();
    };
    node.addEventListener("touchmove", containHorizontalSwipe, { passive: false });
    return () => node.removeEventListener("touchmove", containHorizontalSwipe);
  }, [day?.ref]);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    // A fresh tap is intentional even if it follows a swipe immediately.
    suppressClickUntil.current = 0;
    if ((event.target as Element).closest("input, textarea, select, a, [role=slider]")) return;
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) < 60 || Math.abs(x) < Math.abs(y) * 1.5) return;
    const next = itinerary.days[index + (x < 0 ? 1 : -1)];
    suppressClickUntil.current = performance.now() + 350;
    // Finish native touchend before replacing the touched page.
    if (next) window.requestAnimationFrame(() => onSelectDay(next.ref));
  }
  return (
    <>
      <EditionDayPager days={itinerary.days} index={index} onSelectDay={onSelectDay} />
      <div
        className="public-view-scroll edition-paged-scroll overflow-y-auto"
        key={day?.ref ?? "empty"}
        ref={scroller}
        onPointerDownCapture={begin}
        onPointerUpCapture={finish}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onClickCapture={(event) => {
          if (event.detail === 0 || performance.now() >= suppressClickUntil.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <ItineraryEdition
          {...props}
          itinerary={{ ...itinerary, days: day ? [day] : [] }}
          coverItinerary={itinerary}
          onSelectDay={onSelectDay}
          selectedDayRef={day?.ref}
          paged
        />
      </div>
    </>
  );
}
