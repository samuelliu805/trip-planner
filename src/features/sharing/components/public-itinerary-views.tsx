import { canonicalPublicViews } from "../schema";
import type { PublicItinerary, PublicView } from "../types";
import { PublicOverview } from "./public-overview";
import { PublicTable } from "./public-table";
import { PublicTimeline } from "./public-timeline";

function containTouchScroll(event: React.TouchEvent<HTMLDivElement>) {
  const scroller = event.currentTarget;
  const maximum = scroller.scrollHeight - scroller.clientHeight;
  if (maximum <= 1) return;
  if (scroller.scrollTop <= 0) scroller.scrollTop = 1;
  else if (scroller.scrollTop >= maximum) scroller.scrollTop = maximum - 1;
}

export function PublicItineraryViews({
  itinerary,
  onSelectDay,
  onSelectItem,
  selectedDayRef,
  selectedItemRef,
  view,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (dayRef: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedDayRef?: string;
  selectedItemRef?: string;
  view: PublicView;
}) {
  return canonicalPublicViews.map((option) => (
    <PublicItineraryViewPanel
      itinerary={itinerary}
      key={option}
      onSelectDay={onSelectDay}
      onSelectItem={onSelectItem}
      option={option}
      selectedDayRef={selectedDayRef}
      selectedItemRef={selectedItemRef}
      view={view}
    />
  ));
}

export function PublicItineraryViewPanel({
  itinerary,
  onSelectDay,
  onSelectItem,
  option,
  selectedDayRef,
  selectedItemRef,
  view,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (dayRef: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  option: PublicView;
  selectedDayRef?: string;
  selectedItemRef?: string;
  view: PublicView;
}) {
  const viewProps = { itinerary, onSelectDay, onSelectItem, selectedDayRef, selectedItemRef };
  return (
    <section
      aria-labelledby={`public-${option}-tab`}
      className="h-full min-h-0 min-w-0"
      hidden={view !== option}
      id={`public-${option}-panel`}
      role="tabpanel"
    >
      <div
        className={`public-view-scroll h-full min-w-0 ${option === "table" ? "overflow-hidden" : "overflow-y-auto"}`}
        onTouchStart={option === "table" ? undefined : containTouchScroll}
      >
        {option === "overview" ? (
          <PublicOverview {...viewProps} />
        ) : option === "table" ? (
          <PublicTable {...viewProps} />
        ) : (
          <PublicTimeline {...viewProps} />
        )}
      </div>
    </section>
  );
}
