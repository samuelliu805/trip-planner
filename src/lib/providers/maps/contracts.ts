export type MarkerKind = "city" | "activity" | "hotel" | "carRental" | "meal";

export type PlannerMapMarker = {
  accessibleLabel?: string;
  address?: string;
  appearance?:
    | "category"
    | "comparison-active"
    | "comparison-inactive"
    | "day-city"
    | "overview"
    | "route-planned"
    | "route-unplanned";
  entries: {
    dayLabel: string;
    dayNumber: number;
    itemId: string;
    kind: MarkerKind;
    title: string;
  }[];
  glyphColor?: string;
  id: string;
  itemIds: string[];
  latitude: number;
  label?: string;
  longitude: number;
  readOnly?: boolean;
  selectable?: boolean;
  summary?: string;
  stageNumber?: number;
  variantColor?: string;
  variantId?: string;
  variantName?: string;
  zIndex?: number;
};

export type PlannerMapLine = {
  color?: string;
  dashed?: boolean;
  geodesic?: boolean;
  id: string;
  opacity?: number;
  path: Array<{ lat: number; lng: number }>;
  position?: number;
  readOnly?: boolean;
  routeLayer?: "city" | "places";
  strokeWeight?: number;
  variantId?: string;
  zIndex?: number;
};

export type PlannerMapCanvasProps = {
  colorScheme?: "DARK" | "FOLLOW_SYSTEM" | "LIGHT";
  compact?: boolean;
  configurationState?: { message: string; title: string };
  emptyState?: { message: string; title: string };
  failureState?: { message: string; title: string };
  lines?: PlannerMapLine[];
  markers: PlannerMapMarker[];
  onMarkerClick: (id?: string) => void;
  onRetry?: () => void;
  selectedId?: string;
  viewportKey?: string;
};
