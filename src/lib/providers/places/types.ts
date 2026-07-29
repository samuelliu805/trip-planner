import type { Coordinates } from "@/lib/providers/maps/types";

export interface PlaceReference {
  source: string;
  externalId: string;
}

export interface PlaceSearchResult {
  reference: PlaceReference;
  name: string;
  position: Coordinates;
}

export interface PlaceProvider {
  search(query: string): Promise<PlaceSearchResult[]>;
  get(reference: PlaceReference): Promise<PlaceSearchResult | null>;
}
