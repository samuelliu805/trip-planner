export type RouteTravelMode = "walk" | "drive" | "bicycle" | "transit";

export type RouteWaypoint = { itemId: string; latitude: number; longitude: number };

export interface RouteRequest {
  waypoints: RouteWaypoint[];
  travelMode: RouteTravelMode;
}

export interface RouteResult {
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  legs: Array<{ distanceMeters: number; durationSeconds: number }>;
}

export interface RouteProvider {
  calculate(request: RouteRequest): Promise<RouteResult>;
}
