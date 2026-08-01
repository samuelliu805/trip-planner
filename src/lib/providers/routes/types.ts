import type { Coordinates } from "@/lib/providers/maps/types";

export type TravelMode = "driving" | "walking";

export interface RouteRequest {
  origin: Coordinates;
  destination: Coordinates;
  intermediates?: Coordinates[];
  travelMode: TravelMode;
}

export interface RouteResult {
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
}

export interface RouteProvider {
  calculate(request: RouteRequest): Promise<RouteResult>;
}
