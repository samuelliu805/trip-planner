import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import type { OverviewStage } from "@/features/routes/overview";

export type VariantComparisonCity = {
  formattedAddress?: string;
  itemId: string;
  latitude: number;
  longitude: number;
  placeId: string;
  placeKey: string;
  sortOrder: number;
  title: string;
};

export type VariantComparisonDay = {
  cities: VariantComparisonCity[];
  date: string | null;
  dayNumber: number;
  id: string;
};

export type VariantComparisonProjection = {
  color: string;
  days: VariantComparisonDay[];
  isPrimary: boolean;
  name: string;
  variantId: string;
};

export type VariantComparisonIdentity = {
  color: string;
  id: string;
  is_primary: boolean;
  name: string;
};

export type ComparisonVariantRow = {
  color: string;
  created_at: string;
  id: string;
  is_primary: boolean;
  name: string;
};

export type ComparisonDayRow = {
  date: string | null;
  day_number: number;
  id: string;
  variant_id: string;
};

export type ComparisonPlaceRow = {
  formatted_address: string | null;
  google_place_id: string | null;
  id: string;
  latitude: number | null;
  longitude: number | null;
};

export type ComparisonCityRow = {
  day_id: string;
  id: string;
  place: ComparisonPlaceRow | null;
  place_id: string | null;
  sort_order: number;
  title: string;
  variant_id: string;
};

export type VariantComparisonPresentation = {
  citySequence: string;
  color: string;
  isActive: boolean;
  isPrimary: boolean;
  lines: PlannerMapLine[];
  markers: PlannerMapMarker[];
  name: string;
  stages: OverviewStage[];
  variantId: string;
};
