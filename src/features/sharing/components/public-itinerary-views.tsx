import { PagedItineraryEdition } from "./editorial/paged-itinerary-edition";
import { OverviewEdition } from "./editorial/overview-edition";
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
  transportPlacement,
  templateId,
  view,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (dayRef: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  selectedDayRef?: string;
  selectedItemRef?: string;
  transportPlacement?: "flow" | "header";
  templateId?: string;
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
      templateId={templateId}
      transportPlacement={transportPlacement}
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
  transportPlacement,
  templateId,
  view,
}: {
  itinerary: PublicItinerary;
  onSelectDay: (dayRef: string) => void;
  onSelectItem: (itemRef: string, dayRef: string) => void;
  option: PublicView;
  selectedDayRef?: string;
  selectedItemRef?: string;
  transportPlacement?: "flow" | "header";
  templateId?: string;
  view: PublicView;
}) {
  const viewProps = { itinerary, onSelectDay, onSelectItem, selectedDayRef, selectedItemRef };
  const editorial = templateId === "journal" || templateId === "ethereal";
  return (
    <section
      aria-labelledby={`public-${option}-tab`}
      className={`h-full min-h-0 min-w-0 ${editorial && option === "timeline" ? "edition-timeline-panel" : ""}`}
      hidden={view !== option}
      id={`public-${option}-panel`}
      role="tabpanel"
    >
      {editorial && option === "timeline" ? (
        <PagedItineraryEdition {...viewProps} templateId={templateId} />
      ) : (
        <div
          className={`public-view-scroll h-full min-w-0 ${option === "table" ? "overflow-hidden" : "overflow-y-auto"}`}
        >
          {option === "overview" && editorial ? (
            <OverviewEdition {...viewProps} templateId={templateId} />
          ) : option === "overview" ? (
            <PublicOverview {...viewProps} />
          ) : option === "table" ? (
            <PublicTable {...viewProps} />
          ) : (
            <PublicTimeline {...viewProps} transportPlacement={transportPlacement} />
          )}
        </div>
      )}
    </section>
  );
}
