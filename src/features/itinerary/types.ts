import type { Tables } from "@/types/database";
import type { PlaceSnapshot } from "@/lib/providers/places/types";
import type { DayRoutePlan } from "@/features/routes/types";
import type { OwnerAttachment } from "@/features/attachments/schema";

export type ItineraryItemLink = Pick<
  Tables<"itinerary_item_links">,
  "id" | "item_id" | "label" | "url" | "sort_order"
>;
export type ItineraryItem = Tables<"itinerary_items"> & {
  attachments?: OwnerAttachment[];
  links?: ItineraryItemLink[];
  place?: PersistedPlaceSnapshot | null;
};
export type PersistedPlaceSnapshot = PlaceSnapshot & { id: string };
export type TripDay = Pick<
  Tables<"trip_days">,
  "date" | "day_number" | "id" | "notes" | "title" | "variant_id"
>;

export type PlannerVariant = Pick<
  Tables<"route_variants">,
  "color" | "id" | "is_primary" | "name" | "trip_id"
>;

export type PlannerDay = TripDay & { items: ItineraryItem[] };

export type PlannerWorkspace = {
  days: PlannerDay[];
  routePlans: DayRoutePlan[];
  variant: PlannerVariant;
};

export type ItineraryItemType = ItineraryItem["type"];

export type CarRentalDetails = {
  action: "pickup" | "return";
  address?: string;
  provider?: string;
  researchSourceId?: string;
};

export type TransportDetails = {
  arrivalDate?: string;
  arrivalTime?: string;
  departureDate?: string;
  destination?: string;
  destinationPlace?: PlaceSnapshot;
  mode: TransportMode;
  origin?: string;
  originPlace?: PlaceSnapshot;
  researchSourceId?: string;
  segmentIndex?: number;
  serviceNumber?: string;
};

export const transportModes = [
  "flight",
  "train",
  "self_driving",
  "bus",
  "ferry",
  "taxi",
  "rideshare",
  "bike",
  "walk",
  "subway",
  "tram",
  "shuttle",
  "cable_car",
  "motorcycle",
  "other",
] as const;
export type TransportMode = (typeof transportModes)[number];

export const transportModeLabels: Record<TransportMode, string> = {
  bike: "Bike",
  bus: "Bus",
  cable_car: "Cable car",
  ferry: "Ferry",
  flight: "Flight",
  motorcycle: "Motorcycle",
  other: "Other",
  rideshare: "Rideshare",
  self_driving: "Drive",
  shuttle: "Shuttle",
  subway: "Subway / metro",
  taxi: "Taxi",
  train: "Train",
  tram: "Tram",
  walk: "Walk",
};

export function normalizeTransportMode(value?: string): TransportMode {
  if (value === "coach") return "bus";
  if (value === "metro" || value === "light_rail") return "subway";
  if (value === "rental_car") return "self_driving";
  return transportModes.includes(value as TransportMode) ? (value as TransportMode) : "train";
}

export type MutationResult<T = ItineraryItem> =
  { data: T; error?: never } | { data?: never; error: string };
