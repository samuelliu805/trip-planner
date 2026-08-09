import type { PublicItinerary } from "../types";

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
  token: string;
};
