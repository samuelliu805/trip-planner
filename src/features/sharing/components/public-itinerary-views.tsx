import { canonicalPublicViews } from "../schema";
import type { PublicItinerary, PublicView } from "../types";
import { PublicOverview } from "./public-overview";
import { PublicTable } from "./public-table";
import { PublicTimeline } from "./public-timeline";

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
  const viewProps = {
    itinerary,
    onSelectDay,
    onSelectItem,
    selectedDayRef,
    selectedItemRef,
  };

  return canonicalPublicViews.map((option) => (
    <section
      aria-labelledby={`public-${option}-tab`}
      className="h-full min-h-0 min-w-0"
      hidden={view !== option}
      id={`public-${option}-panel`}
      key={option}
      role="tabpanel"
    >
      <div
        className={`h-full min-w-0 ${option === "table" ? "overflow-hidden" : "overflow-y-auto"}`}
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
  ));
}
