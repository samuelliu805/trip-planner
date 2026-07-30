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
  confirmed: boolean;
  location: string;
  provider?: string;
  time?: string;
};

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
