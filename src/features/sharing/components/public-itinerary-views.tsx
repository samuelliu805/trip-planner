import { ItineraryEdition } from "./editorial/itinerary-edition";
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
      >
        {option !== "table" && (templateId === "journal" || templateId === "ethereal") ? (
          <ItineraryEdition
            {...viewProps}
            templateId={templateId}
            overview={option === "overview"}
          />
        ) : option === "overview" ? (
          <PublicOverview {...viewProps} />
        ) : option === "table" ? (
          <PublicTable {...viewProps} />
        ) : (
          <PublicTimeline {...viewProps} transportPlacement={transportPlacement} />
        )}
      </div>
    </section>
  );
}
