"use client";

import { useRef, type PointerEvent } from "react";
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
  const suppressClick = useRef(false);
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
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
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 350);
    event.preventDefault();
    if (next) onSelectDay(next.ref);
  }
  return (
    <>
      <EditionDayPager days={itinerary.days} index={index} onSelectDay={onSelectDay} />
      <div
        className="public-view-scroll edition-paged-scroll overflow-y-auto"
        key={day?.ref ?? "empty"}
        onPointerDownCapture={begin}
        onPointerUpCapture={finish}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
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
