import type { PlannerMapLine, PlannerMapMarker } from "@/features/maps/planner-map-model";
import type { OverviewStage } from "@/features/routes/overview";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import type { Json } from "@/types/database";

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
  route: VariantComparisonDayRoute;
};

export type VariantComparisonRouteStop = {
  formattedAddress?: string;
  itemId: string;
  latitude: number;
  longitude: number;
  placeId: string;
  sortOrder: number;
  title: string;
  type: "activity" | "hotel" | "meal";
};

export type VariantComparisonDayRoute = {
  calculatedLegs: CalculatedRouteLeg[];
  saved: boolean;
  stops: VariantComparisonRouteStop[];
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
  country_code: string | null;
  formatted_address: string | null;
  google_place_id: string | null;
  id: string;
  latitude: number | null;
  locality_name: string | null;
  longitude: number | null;
};

export type ComparisonCityRow = {
  day_id: string;
  id: string;
  place: ComparisonPlaceRow | null;
  place_id: string | null;
  sort_order: number;
  title: string;
  type:
    "location" | "activity" | "meal" | "hotel" | "car_rental" | "transport" | "flight" | "train";
  variant_id: string;
};

export type ComparisonRoutePlanRow = {
  day_id: string;
  id: string;
  variant_id: string;
};

export type ComparisonRouteStopRow = {
  item_id: string;
  plan_id: string;
  position: number;
};

export type ComparisonRouteCalculationRow = {
  calculated_legs: Json;
  plan_id: string;
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
