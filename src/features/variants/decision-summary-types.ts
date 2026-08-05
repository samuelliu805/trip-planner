import type { TransportMode } from "@/features/itinerary/types";
import type { DayRouteStatus } from "@/features/routes/status";
import type { RouteLegMode } from "@/features/routes/types";
import type { CalculatedRouteLeg } from "@/lib/providers/routes/types";
import type { Json } from "@/types/database";

export const decisionSummaryItemTypes = [
  "location",
  "activity",
  "meal",
  "hotel",
  "car_rental",
  "transport",
  "flight",
  "train",
] as const;

export type DecisionSummaryItemType = (typeof decisionSummaryItemTypes)[number];

export type DecisionSummaryVariantRow = {
  color: string;
  created_at: string;
  id: string;
  is_primary: boolean;
  name: string;
};

export type DecisionSummaryDayRow = {
  date: string | null;
  day_number: number;
  id: string;
  variant_id: string;
};

export type DecisionSummaryPlaceRow = {
  google_place_id: string | null;
  id: string;
  latitude: number | null;
  longitude: number | null;
};

export type DecisionSummaryItemRow = {
  day_id: string;
  details: Json;
  id: string;
  place: DecisionSummaryPlaceRow | null;
  place_id: string | null;
  sort_order: number;
  title: string;
  trip_id: string;
  type: DecisionSummaryItemType;
  variant_id: string;
};

export type DecisionSummaryPlanRow = {
  day_id: string;
  id: string;
  trip_id: string;
  variant_id: string;
};

export type DecisionSummaryStopRow = {
  id: string;
  item_id: string;
  plan_id: string;
  position: number;
};

export type DecisionSummaryLegRow = {
  from_stop_id: string;
  mode: string;
  plan_id: string;
  position: number;
  to_stop_id: string;
};

export type DecisionSummaryCalculationRow = {
  calculated_legs: Json;
  config_signature: string;
  plan_id: string;
};

export type DecisionSummaryInput = {
  calculations: DecisionSummaryCalculationRow[];
  days: DecisionSummaryDayRow[];
  items: DecisionSummaryItemRow[];
  legs: DecisionSummaryLegRow[];
  plans: DecisionSummaryPlanRow[];
  stops: DecisionSummaryStopRow[];
  variants: DecisionSummaryVariantRow[];
};

export type DecisionSummaryModeCount<TMode extends string = TransportMode> = {
  count: number;
  label: string;
  mode: TMode;
};

export type DecisionSummaryModeDistance<TMode extends string = RouteLegMode> = {
  distanceMeters: number;
  label: string;
  mode: TMode;
};

export type DecisionSummaryRouteCoverage = Record<DayRouteStatus, number> & {
  currentCalculatedLegCount: number;
  fallbackLegCount: number;
  noRouteFallbackCount: number;
  totalSavedPlans: number;
  unsupportedModeFallbackCount: number;
};

export type HotelOccurrence = {
  date: string | null;
  dayNumber: number;
  identity: string;
  itemId: string;
  placeId: string | null;
  title: string;
};

export type VariantDecisionSummaryProjection = {
  citySequence: string[];
  citySpanMeters: number | null;
  cityStageCount: number;
  color: string;
  dayCount: number;
  dayDates: Array<{ date: string | null; dayNumber: number }>;
  hotelOccurrences: HotelOccurrence[];
  isPrimary: boolean;
  knownDayRouteDistanceMeters: number | null;
  knownDurationSeconds: number | null;
  name: string;
  nightCount: number | null;
  nightUnknownReason: "Dates incomplete" | "Dates not continuous" | null;
  plannedPlaceOccurrenceCount: number;
  routeCoverage: DecisionSummaryRouteCoverage;
  savedDayRouteDistanceByMode: DecisionSummaryModeDistance[];
  savedDayRouteModes: DecisionSummaryModeCount<RouteLegMode>[];
  tripTransportModes: DecisionSummaryModeCount[];
  uniqueCityPlaceCount: number;
  uniquePlannedPlaces: number;
  unknownDurationLegCount: number;
  variantId: string;
};

export type HotelDifferenceEntry = {
  alignmentLabel: string;
  compared?: HotelOccurrence;
  primary?: HotelOccurrence;
  status: "same" | "changed" | "added" | "removed";
};

export type HotelDifference = {
  added: number;
  affectedLabels: string[];
  changed: number;
  entries: HotelDifferenceEntry[];
  removed: number;
  same: number;
};

export type DecisionSummaryDeltas = {
  citySpanMeters: number | null;
  cityStages: number;
  dayRouteDistanceByMode: DecisionSummaryModeDistance[] | null;
  days: number;
  hotelAdded: number;
  hotelChanged: number;
  hotelRemoved: number;
  knownDayRouteDistanceMeters: number | null;
  knownDurationSeconds: number | null;
  nights: number | null;
  uniqueCityPlaces: number;
  uniquePlannedPlaces: number;
};

export type VariantDecisionSummary = VariantDecisionSummaryProjection & {
  deltas: DecisionSummaryDeltas | null;
  hotelDifference: HotelDifference | null;
};

export type DecisionSummaryCalculatedPlan = {
  calculation: {
    calculatedLegs: CalculatedRouteLeg[];
    config_signature: string;
  } | null;
  day_id: string;
  legs: Array<{
    from_stop_id: string;
    mode: RouteLegMode;
    position: number;
    to_stop_id: string;
  }>;
  stops: DecisionSummaryStopRow[];
  trip_id: string;
  variant_id: string;
};
