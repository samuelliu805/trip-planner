import type { Coordinates } from "@/lib/providers/maps/types";

export type PlaceSnapshot = Coordinates & {
  provider: "google" | "custom";
  providerPlaceId?: string;
  displayName: string;
  formattedAddress?: string;
};

export const placeFields = ["id", "displayName", "formattedAddress", "location"] as const;
