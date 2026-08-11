import type {
  Dispatch,
  KeyboardEvent,
  MouseEvent,
  MutableRefObject,
  PointerEvent,
  SetStateAction,
} from "react";

import type { PlannerCategory, EditorState } from "./planner-config";
import type { PlannerMapMode } from "./planner-map-types";
import type { GridCoordinate } from "../grid-interactions";
import type { ItineraryItem, PlannerDay, PlannerWorkspace } from "../types";
import type { PlannerMapLine, PlannerMapMarker } from "../../maps/planner-map-model";
import type { DayRouteUi } from "../../routes/use-day-route";
import type { OverviewRouteUi } from "../../routes/use-overview-route";
import type { DayMapLayer } from "../../routes/day-city-map";
import type { VariantComparisonUi } from "../../variants/use-variant-comparison";
import type { VariantDecisionSummaryUi } from "../../variants/use-variant-decision-summary";

type MapEmptyState = { message: string; title: string };

export type PlannerMatrixProps = {
  compactMapEmptyState?: MapEmptyState;
  compactMapLines: PlannerMapLine[];
  compactMapMarkers: PlannerMapMarker[];
  compactMapViewportKey?: string;
  comparison: VariantComparisonUi;
  decisionSummary: VariantDecisionSummaryUi;
  decisionSummaryPanelOpen: boolean;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  dayCityLayerAvailable: boolean;
  dayMapLayer: DayMapLayer;
  dayMutationPending: boolean;
  dayRoute: DayRouteUi;
  deleteItem: (item: ItineraryItem) => Promise<void>;
  fillDragging: MutableRefObject<boolean>;
  fillSourceRight: MutableRefObject<number>;
  focusCell: (coordinate: GridCoordinate, extend: boolean) => void;
  gridTemplate: string;
  handleCellKey: (
    event: KeyboardEvent,
    coordinate: GridCoordinate,
    dayId: string,
    category: PlannerCategory,
    items: ItineraryItem[],
  ) => void;
  insertDay: (position: number) => Promise<void>;
  isFillDragging: boolean;
  mapEmptyState?: MapEmptyState;
  mapLines: PlannerMapLine[];
  mapMode: PlannerMapMode;
  mapMarkers: PlannerMapMarker[];
  mapViewportKey?: string;
  onArrangeActivities: (day: PlannerDay) => void;
  onComparisonSheetOpen: () => void;
  onDayMapLayerChange: (layer: DayMapLayer) => void;
  onDecisionSummaryOpen: () => void;
  onDecisionSummaryPanelClose: () => void;
  onEditMapItem: (itemId: string) => void;
  onMapExpand: () => void;
  onMapModeChange: (mode: PlannerMapMode) => void;
  onMapSelectionClear: () => void;
  onMarkerClick: (id?: string) => void;
  openEditorFromDoubleClick: (event: MouseEvent<HTMLDivElement>) => void;
  overviewRoute: OverviewRouteUi;
  removeDay: (id: string) => Promise<void>;
  selectedCount: number;
  selectedDayRow: number | null;
  selectedMapItem?: ItineraryItem;
  selectionAnchor: GridCoordinate;
  selectionEnd: GridCoordinate;
  selectionEndRef: MutableRefObject<GridCoordinate>;
  selectDay: (row: number) => void;
  selectItem: (item: ItineraryItem, coordinate: GridCoordinate) => void;
  setEditor: Dispatch<SetStateAction<EditorState | null>>;
  setSelectionEnd: (coordinate: GridCoordinate) => void;
  setSplit: Dispatch<SetStateAction<number>>;
  split: number;
  startFill: (event: PointerEvent) => void;
  startRangeSelection: (event: PointerEvent<HTMLDivElement>) => void;
  startResize: (event: PointerEvent<HTMLDivElement>) => void;
  tripTitle: string;
  visibleSelectionBounds: { top: number; bottom: number; left: number; right: number };
  workspace: PlannerWorkspace;
};
