import type { PublicItinerary } from "../types";
import type { PublicTemplate } from "../public-url-state";

export type PublicMapSelection = {
  dayRef?: string;
  itemRef?: string;
  scope?: "day" | "overview";
};

export type PublicMapWorkspaceProps = {
  activeView: "overview" | "table" | "timeline";
  itinerary: PublicItinerary;
  onSelectionChange: (selection: PublicMapSelection) => void;
  selectedDayRef?: string;
  selectedItemRef?: string;
  selectionScope?: "day" | "overview";
  template: PublicTemplate;
  token: string;
};
