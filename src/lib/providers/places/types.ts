import type { Coordinates } from "@/lib/providers/maps/types";

export type PlaceSnapshot = Coordinates & {
  provider: "google" | "custom";
  providerPlaceId?: string;
  displayName: string;
  formattedAddress?: string;
};

export interface PlaceReference {
  source: string;
  externalId: string;
}

export interface PlaceSearchResult {
  snapshot: PlaceSnapshot;
}

export interface PlaceProvider {
  search(query: string): Promise<PlaceSearchResult[]>;
  get(reference: PlaceReference, fields: readonly PlaceField[]): Promise<PlaceSnapshot | null>;
}

export const placeFields = ["id", "displayName", "formattedAddress", "location"] as const;
export type PlaceField = (typeof placeFields)[number];
