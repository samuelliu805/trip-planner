import type { Tables } from "@/types/database";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import type { OwnerAttachment } from "@/features/attachments/schema";

export const researchCategories = ["flight", "stay", "train", "rental"] as const;

export type ResearchCategory = (typeof researchCategories)[number];
type StoredResearchPlace = Pick<
  Tables<"places">,
  | "administrative_area_name"
  | "country_code"
  | "display_name"
  | "formatted_address"
  | "google_place_id"
  | "id"
  | "latitude"
  | "locality_kind"
  | "locality_name"
  | "locality_source"
  | "longitude"
  | "source"
>;
export type ResearchItem = Tables<"research_items"> & {
  attachments?: OwnerAttachment[];
  destination_place?: StoredResearchPlace | null;
  location_place?: StoredResearchPlace | null;
  origin_place?: StoredResearchPlace | null;
};
export type ResearchJourneyType = "one_way" | "round_trip" | "multi_city";
export type ResearchSegment = {
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  carrier?: string | null;
  departureDate: string;
  departureTime?: string | null;
  destination: string;
  origin: string;
  serviceNumber?: string | null;
};
export type ResearchPlace = PlaceSnapshot & { id: string };
export type ResearchLink = { label: string; url: string };
export type ResearchPlanApplication = Tables<"research_plan_applications">;
export type VariantResearchSelection = Tables<"variant_research_selections">;

export const researchCategoryLabels: Record<ResearchCategory, string> = {
  flight: "Flights",
  rental: "Rentals",
  stay: "Stays",
  train: "Trains",
};

export const researchCategorySingularLabels: Record<ResearchCategory, string> = {
  flight: "Flight",
  rental: "Rental",
  stay: "Stay",
  train: "Train",
};

export type PlanResearchItem = ResearchItem;

export type ResearchMutationResult<T> =
  { data: T; error?: never } | { data?: never; error: string };

export type ResearchSort = "price" | "recent";

export type KnownCostAmount = { amount: number; currency: string };

export type PlanCostBreakdownLine = {
  amount: number;
  currency: string;
  date?: string | null;
  dayNumber: number;
  itemId: string;
  title: string;
  type: Tables<"itinerary_items">["type"];
};

export type ExchangeRateTable = {
  asOf: string;
  baseCurrency: "EUR";
  rates: Record<string, number>;
  source: "European Central Bank";
};

export type ConvertedPlanCostLine = PlanCostBreakdownLine & {
  convertedAmount: number | null;
  convertedCurrency: string;
};

export type PlanCostSummary = {
  amount: number | null;
  complete: boolean;
  converted: boolean;
  currency: string;
  itemCount: number;
  rateDate: string | null;
  unavailableCurrencies: string[];
};

export type ResearchPlanItem = Pick<
  Tables<"itinerary_items">,
  "details" | "id" | "place_id" | "price_amount" | "price_currency" | "title" | "type"
>;

export type ResearchPlanDay = {
  date: string | null;
  dayNumber: number;
  id: string;
  items: ResearchPlanItem[];
};

export type ResearchPlanSnapshot = {
  days: ResearchPlanDay[];
  variantId: string;
};

export type ResearchWorkspaceSnapshot = {
  applications: ResearchPlanApplication[];
  currentApplicationIds: string[];
  items: ResearchItem[];
  plan: ResearchPlanSnapshot;
  selections: VariantResearchSelection[];
};

export type OptionImpactCode =
  "exact_fit" | "date_shift_same_duration" | "structural_change" | "manual_review";

export type OptionImpact = {
  affectedDayCount: number;
  code: OptionImpactCode;
  currentTitle?: string;
  dayDelta: number;
  label: string;
  message: string;
  operation: "add" | "replace";
  planAction:
    "apply" | "extend_plan" | "remove_days_first" | "use_different_dates" | "manual_review";
};

export type AppliedResearchResult = {
  application: ResearchPlanApplication;
  selection: VariantResearchSelection;
};

export type ApplyRpcResult = {
  affectedEntityIds: string[];
  applicationId: string;
  appliedAt: string;
  operationType: "add" | "mixed" | "replace";
  status: "applied";
};

export type RevertConflict = {
  changedFields: string[];
  entityId: string;
  kind: string;
  safeFields: string[];
};

export type RevertRpcResult =
  | { applicationId: string; revertedAt: string; status: "reverted" }
  | { applicationId: string; conflicts: RevertConflict[]; status: "conflict" };
