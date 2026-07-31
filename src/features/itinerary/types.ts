import type { Json, Tables } from "@/types/database";

export type ItineraryItem = Tables<"itinerary_items">;
export type TripDay = Pick<Tables<"trip_days">, "date" | "day_number" | "id" | "notes" | "title" | "variant_id">;

export type PlannerVariant = Pick<Tables<"route_variants">, "color" | "id" | "is_primary" | "name" | "trip_id">;

export type PlannerDay = TripDay & { items: ItineraryItem[] };

export type PlannerWorkspace = {
  days: PlannerDay[];
  variant: PlannerVariant;
};

export type ItineraryItemType = ItineraryItem["type"];

export type CarRentalDetails = {
  action: "pickup" | "return";
  address?: string;
  provider?: string;
};

export const transportModes = ["flight", "train", "self_driving", "bus", "ferry", "taxi", "rideshare", "bike", "walk", "subway", "tram", "shuttle", "cable_car", "motorcycle", "other"] as const;
export type TransportMode = (typeof transportModes)[number];

export const transportModeLabels: Record<TransportMode, string> = {
  bike: "Bike", bus: "Bus", cable_car: "Cable car", ferry: "Ferry", flight: "Flight",
  motorcycle: "Motorcycle", other: "Other", rideshare: "Rideshare", self_driving: "Drive",
  shuttle: "Shuttle", subway: "Subway / metro", taxi: "Taxi", train: "Train", tram: "Tram", walk: "Walk",
};

export function normalizeTransportMode(value?: string): TransportMode {
  if (value === "coach") return "bus";
  if (value === "metro" || value === "light_rail") return "subway";
  if (value === "rental_car") return "self_driving";
  return transportModes.includes(value as TransportMode) ? value as TransportMode : "train";
}

export type ItemDetails = Json;

export type MutationResult<T = ItineraryItem> =
  | { data: T; error?: never }
  | { data?: never; error: string };

export type ReorderItemInput = { id: string; sortOrder: number };

export type CopyItemsInput = {
  preservePlace?: boolean;
  sourceItemIds: string[];
  targetDayId: string;
};
